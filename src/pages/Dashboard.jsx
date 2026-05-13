import { lazy, Suspense, useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Package,
  Loader2,
  CheckCircle2,
  Circle,
  ArrowRight,
  ClipboardList,
  Wallet,
  BookOpen,
  PackagePlus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const SalesChart = lazy(() => import('../components/dashboard/SalesChart'));

const getExpenseTotal = (expense) =>
  expense.total_price || (['gr', 'ml'].includes(expense.unit) ? expense.unit_price : expense.unit_price * expense.quantity);

const subDaysLocal = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() - days);
  return next;
};

const toLocalDateKey = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isSameLocalDay = (a, b) => toLocalDateKey(a) === toLocalDateKey(b);

const dayLabel = (date) => new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(date);

const StatCard = ({ title, value, icon: Icon, color, loading }) => (
  <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 transition-all hover:shadow-md">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-gray-500 dark:text-gray-400 font-medium text-sm">{title}</h3>
      <div className={`p-2 rounded-xl bg-${color}-50 dark:bg-${color}-900/20 text-${color}-600 dark:text-${color}-400`}>
        <Icon size={20} />
      </div>
    </div>
    <div className="flex flex-col gap-1">
      {loading ? (
        <Loader2 size={24} className="animate-spin text-gray-400" />
      ) : (
        <span className="text-2xl font-bold text-gray-900 dark:text-white">{value}</span>
      )}
      <div className="flex items-center gap-1.5 text-sm mt-1">
        <span className="text-gray-400 dark:text-gray-500">Berdasarkan data hari ini</span>
      </div>
    </div>
  </div>
);

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    todaySales: 0,
    todayExpenses: 0,
    todayProfit: 0,
    todayUnitsSold: 0,
    todayProduced: 0
  });
  const [chartData, setChartData] = useState([]);
  const [bestSellers, setBestSellers] = useState([]);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [lowStockIngredients, setLowStockIngredients] = useState([]);
  const [setupStatus, setSetupStatus] = useState({
    products: false,
    ingredients: false,
    recipes: false,
    production: false,
    sales: false,
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    const today = new Date();
    const sevenDaysAgo = subDaysLocal(today, 6);

    // Fetch Sales
    const { data: salesData } = await supabase
      .from('sales')
      .select('*, products(name)')
      .gte('transaction_date', sevenDaysAgo.toISOString());

    // Fetch Expenses (Ingredients)
    const { data: expensesData } = await supabase
      .from('ingredients')
      .select('*')
      .gte('purchase_date', sevenDaysAgo.toISOString());

    // Fetch Production Logs (optional — table may not exist yet)
    const { data: productionData } = await supabase
      .from('production_logs')
      .select('quantity, production_date')
      .gte('production_date', sevenDaysAgo.toISOString());

    const [
      { data: productStockData },
      { data: ingredientStockData },
      { data: allProducts },
      { data: allIngredientMasters },
      { data: recipeRows },
    ] = await Promise.all([
      supabase.from('products').select('id, name, stock, cost_price').eq('is_available', true).lte('stock', 5).order('stock', { ascending: true }).limit(5),
      supabase.from('ingredient_masters').select('name, current_stock, min_stock, unit').gt('min_stock', 0).order('current_stock', { ascending: true }).limit(8),
      supabase.from('products').select('id, cost_price').eq('is_available', true),
      supabase.from('ingredient_masters').select('id').limit(1),
      supabase.from('recipes').select('product_id'),
    ]);
    setLowStockProducts(productStockData || []);
    setLowStockIngredients((ingredientStockData || []).filter(item => item.current_stock <= item.min_stock).slice(0, 5));
    setSetupStatus({
      products: (allProducts || []).length > 0,
      ingredients: (allIngredientMasters || []).length > 0 || (expensesData || []).length > 0,
      recipes: (recipeRows || []).length > 0,
      production: (productionData || []).length > 0,
      sales: (salesData || []).length > 0,
    });

    if (salesData && expensesData) {
      // Calculate Today's Stats
      let tSales = 0;
      let tExpenses = 0;
      let tUnits = 0;
      let tProduced = 0;

      salesData.forEach(sale => {
        if (isSameLocalDay(sale.transaction_date, today)) {
          tSales += sale.total_price || (sale.unit_price * sale.quantity);
          tUnits += sale.quantity;
        }
      });

      expensesData.forEach(exp => {
        if (isSameLocalDay(exp.purchase_date, today)) {
          tExpenses += getExpenseTotal(exp);
        }
      });

      (productionData || []).forEach(log => {
        if (isSameLocalDay(log.production_date, today)) {
          tProduced += log.quantity;
        }
      });

      setStats({
        todaySales: tSales,
        todayExpenses: tExpenses,
        todayProfit: tSales - tExpenses,
        todayUnitsSold: tUnits,
        todayProduced: tProduced
      });

      // Calculate Chart Data (Last 7 Days)
      const cData = [];
      for (let i = 6; i >= 0; i--) {
        const targetDate = subDaysLocal(today, i);
        let daySales = 0;
        let dayExpenses = 0;

        salesData.forEach(sale => {
          if (isSameLocalDay(sale.transaction_date, targetDate)) {
            daySales += sale.total_price || (sale.unit_price * sale.quantity);
          }
        });
        expensesData.forEach(exp => {
          if (isSameLocalDay(exp.purchase_date, targetDate)) {
            dayExpenses += getExpenseTotal(exp);
          }
        });

        cData.push({
          name: dayLabel(targetDate),
          Penjualan: daySales,
          Keuntungan: daySales - dayExpenses
        });
      }
      setChartData(cData);

      // Calculate Best Sellers
      const productMap = {};
      salesData.forEach(sale => {
        const pName = sale.products?.name || 'Produk Dihapus';
        if (!productMap[pName]) {
          productMap[pName] = { name: pName, sales: 0, revenue: 0 };
        }
        productMap[pName].sales += sale.quantity;
        productMap[pName].revenue += sale.total_price || (sale.unit_price * sale.quantity);
      });

      const bSellers = Object.values(productMap)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 4);
      setBestSellers(bSellers);
    }
    setLoading(false);
  };

  const setupTasks = [
    { id: 'products', label: 'Tambah produk', path: '/produk', icon: PackagePlus },
    { id: 'ingredients', label: 'Catat bahan', path: '/modal', icon: Wallet },
    { id: 'recipes', label: 'Buat resep', path: '/resep', icon: BookOpen },
    { id: 'production', label: 'Catat produksi', path: '/produksi', icon: ClipboardList },
    { id: 'sales', label: 'Catat penjualan', path: '/penjualan', icon: ShoppingBag },
  ];
  const completedSetup = setupTasks.filter(task => setupStatus[task.id]).length;
  const setupComplete = completedSetup === setupTasks.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Ringkasan Hari Ini</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Pantau performa bisnis Kukis Anda dari data asli.</p>
        </div>
      </div>

      {!setupComplete && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Checklist Mulai Pakai</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{completedSetup} dari {setupTasks.length} langkah selesai.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 flex-1">
              {setupTasks.map(task => {
                const done = setupStatus[task.id];
                const Icon = task.icon;
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => navigate(task.path)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${done ? 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-primary-200 hover:text-primary-600 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300'}`}
                  >
                    {done ? <CheckCircle2 size={15} className="shrink-0" /> : <Circle size={15} className="shrink-0" />}
                    <Icon size={14} className="shrink-0" />
                    <span className="font-medium">{task.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard 
          loading={loading}
          title="Total Penjualan" 
          value={`Rp ${stats.todaySales.toLocaleString('id-ID')}`}
          icon={DollarSign}
          color="primary"
        />
        <StatCard 
          loading={loading}
          title="Untung Bersih" 
          value={`Rp ${stats.todayProfit.toLocaleString('id-ID')}`}
          icon={TrendingUp}
          color="emerald"
        />
        <StatCard
          loading={loading}
          title="Item Terjual"
          value={`${stats.todayUnitsSold} pcs`}
          icon={ShoppingBag}
          color="blue"
        />
        <StatCard
          loading={loading}
          title="Produksi Hari Ini"
          value={`${stats.todayProduced} pcs`}
          icon={Package}
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Produk Perlu Restock</h2>
            {lowStockProducts.length === 0 ? (
              <p className="text-sm text-gray-500">Stok produk aman.</p>
            ) : (
              <div className="space-y-2">
                {lowStockProducts.map(item => (
                  <div key={item.name} className="flex justify-between text-sm">
                    <span className="font-medium text-gray-800 dark:text-gray-100">{item.name}</span>
                    <span className={item.stock <= 0 ? 'text-red-500 font-semibold' : 'text-amber-500 font-semibold'}>{item.stock} pcs</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => navigate('/produksi')} className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700">
              Catat produksi <ArrowRight size={13} />
            </button>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Bahan Perlu Dibeli</h2>
            {lowStockIngredients.length === 0 ? (
              <p className="text-sm text-gray-500">Stok bahan aman.</p>
            ) : (
              <div className="space-y-2">
                {lowStockIngredients.map(item => (
                  <div key={item.name} className="flex justify-between text-sm">
                    <span className="font-medium text-gray-800 dark:text-gray-100">{item.name}</span>
                    <span className="text-amber-500 font-semibold">{item.current_stock} / {item.min_stock} {item.unit}</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => navigate('/modal')} className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700">
              Belanja bahan <ArrowRight size={13} />
            </button>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Aksi Cepat Hari Ini</h2>
            <div className="space-y-2">
              {[
                { label: 'Catat penjualan', path: '/penjualan', icon: ShoppingBag },
                { label: 'Hitung HPP produk', path: '/hpp', icon: DollarSign },
                { label: 'Atur resep', path: '/resep', icon: BookOpen },
              ].map(action => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.path}
                    type="button"
                    onClick={() => navigate(action.path)}
                    className="w-full flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                  >
                    <span className="flex items-center gap-2"><Icon size={15} /> {action.label}</span>
                    <ArrowRight size={14} />
                  </button>
                );
              })}
            </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 min-w-0 bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Grafik Penjualan & Keuntungan (7 Hari Terakhir)</h2>
          <div className="h-80 min-h-80 w-full min-w-0">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-primary-500" />
              </div>
            ) : (
              <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><Loader2 size={28} className="animate-spin text-primary-500" /></div>}>
                <SalesChart data={chartData} />
              </Suspense>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Produk Terlaris</h2>
          </div>
          <div className="space-y-5">
            {loading ? (
               <div className="flex justify-center p-4"><Loader2 className="animate-spin text-gray-400" /></div>
            ) : bestSellers.length === 0 ? (
               <p className="text-sm text-gray-500 text-center py-4">Belum ada data penjualan 7 hari terakhir</p>
            ) : (
              bestSellers.map((product, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center text-primary-600 dark:text-primary-400">
                      <Package size={20} />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate max-w-[120px]">{product.name}</h4>
                      <p className="text-xs text-gray-500">{product.sales} terjual</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block font-medium text-gray-900 dark:text-gray-100 text-sm">
                      Rp {(product.revenue / 1000).toLocaleString('id-ID')}k
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-4">AI Insight 🤖</h2>
            <div className="bg-primary-50 dark:bg-primary-900/10 p-4 rounded-xl border border-primary-100 dark:border-primary-900/30">
              <p className="text-sm text-primary-800 dark:text-primary-300 leading-relaxed">
                <strong className="block mb-1">Rekomendasi Pintar:</strong>
                {lowStockProducts.length > 0
                  ? `Produk ${lowStockProducts[0].name} sedang menipis. Prioritaskan produksi ulang sebelum mencatat promosi atau pesanan baru.`
                  : lowStockIngredients.length > 0
                    ? `Bahan ${lowStockIngredients[0].name} sudah mendekati batas minimum. Pertimbangkan belanja ulang agar produksi tidak tertahan.`
                    : bestSellers.length > 0 
                  ? `Produk ${bestSellers[0].name} adalah yang paling laris minggu ini. Pastikan stok bahan bakunya selalu tersedia untuk memaksimalkan keuntungan!`
                  : `Ayo mulai catat penjualan pertamamu untuk mendapatkan rekomendasi bisnis otomatis dari AI.`
                }
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
