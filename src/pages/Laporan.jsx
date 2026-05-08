import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Download, FileText, Printer, Calendar, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getMonth, getYear, parseISO, startOfYear, endOfYear } from 'date-fns';

export default function Laporan() {
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthlyData, setMonthlyData] = useState([]);
  const [stats, setStats] = useState({
    profitThisMonth: 0,
    profitLastMonth: 0,
    totalSalesYear: 0,
    averageMargin: 0
  });

  useEffect(() => {
    fetchReportData();
  }, [year]);

  const fetchReportData = async () => {
    setLoading(true);
    const startDate = startOfYear(new Date(year, 0, 1)).toISOString();
    const endDate = endOfYear(new Date(year, 11, 31)).toISOString();

    const { data: salesData } = await supabase
      .from('sales')
      .select('*')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);

    const { data: expensesData } = await supabase
      .from('ingredients')
      .select('*')
      .gte('purchase_date', startDate)
      .lte('purchase_date', endDate);

    if (salesData && expensesData) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const dataByMonth = months.map(m => ({ name: m, sales: 0, expenses: 0, profit: 0 }));

      let totalSalesYear = 0;
      let totalExpensesYear = 0;

      salesData.forEach(sale => {
        const monthIdx = getMonth(parseISO(sale.transaction_date));
        const amount = sale.total_price || (sale.unit_price * sale.quantity);
        dataByMonth[monthIdx].sales += amount;
        totalSalesYear += amount;
      });

      expensesData.forEach(exp => {
        const monthIdx = getMonth(parseISO(exp.purchase_date));
        const amount = exp.total_price || (exp.unit_price * exp.quantity);
        dataByMonth[monthIdx].expenses += amount;
        totalExpensesYear += amount;
      });

      let marginSum = 0;
      let activeMonths = 0;

      dataByMonth.forEach(m => {
        m.profit = m.sales - m.expenses;
        if (m.sales > 0) {
          m.margin = (m.profit / m.sales) * 100;
          marginSum += m.margin;
          activeMonths++;
        } else {
          m.margin = 0;
        }
      });

      setMonthlyData(dataByMonth);

      const currentMonthIdx = getMonth(new Date());
      const profitThisMonth = dataByMonth[currentMonthIdx].profit;
      const profitLastMonth = currentMonthIdx > 0 ? dataByMonth[currentMonthIdx - 1].profit : 0;
      
      const averageMargin = activeMonths > 0 ? (marginSum / activeMonths) : 0;

      setStats({
        profitThisMonth,
        profitLastMonth,
        totalSalesYear,
        averageMargin
      });
    }

    setLoading(false);
  };

  const getProfitChange = () => {
    if (stats.profitLastMonth === 0) return 0;
    return ((stats.profitThisMonth - stats.profitLastMonth) / stats.profitLastMonth) * 100;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Laporan Keuangan</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Analisis performa bisnis dan cetak laporan.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <Printer size={18} />
            <span className="hidden sm:inline">Print</span>
          </button>
          <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-emerald-600/20">
            <Download size={18} />
            <span>Export Excel</span>
          </button>
          <button className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-red-600/20">
            <FileText size={18} />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="text-gray-500 dark:text-gray-400 font-medium text-sm mb-1">Untung Bulan Ini</h3>
          {loading ? (
            <Loader2 className="animate-spin text-gray-400 my-2" />
          ) : (
            <>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">Rp {stats.profitThisMonth.toLocaleString('id-ID')}</p>
              <p className={`text-sm font-medium mt-2 ${getProfitChange() >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {getProfitChange() >= 0 ? '+' : ''}{getProfitChange().toFixed(1)}% dari bulan lalu
              </p>
            </>
          )}
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="text-gray-500 dark:text-gray-400 font-medium text-sm mb-1">Margin Keuntungan Rata-rata</h3>
          {loading ? (
            <Loader2 className="animate-spin text-gray-400 my-2" />
          ) : (
            <>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.averageMargin.toFixed(1)}%</p>
              <p className={`text-sm font-medium mt-2 ${stats.averageMargin >= 40 ? 'text-emerald-500' : stats.averageMargin >= 20 ? 'text-amber-500' : 'text-red-500'}`}>
                {stats.averageMargin >= 40 ? 'Sangat Sehat' : stats.averageMargin >= 20 ? 'Cukup Sehat' : 'Perlu Evaluasi Harga'}
              </p>
            </>
          )}
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="text-gray-500 dark:text-gray-400 font-medium text-sm mb-1">Total Penjualan Tahun {year}</h3>
          {loading ? (
            <Loader2 className="animate-spin text-gray-400 my-2" />
          ) : (
            <>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">Rp {stats.totalSalesYear.toLocaleString('id-ID')}</p>
              <p className="text-sm text-gray-400 mt-2">1 Jan - 31 Des {year}</p>
            </>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Grafik Keuntungan Bulanan</h2>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <Calendar size={16} />
              <span>Tahun {year}</span>
            </button>
          </div>
        </div>
        
        <div className="h-80 w-full">
          {loading ? (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 size={32} className="animate-spin text-primary-500" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.2} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={(val) => `Rp ${val/1000000}M`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: 'rgba(255, 255, 255, 0.9)' }}
                  formatter={(value) => [`Rp ${value.toLocaleString('id-ID')}`, 'Keuntungan']}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Bar dataKey="profit" name="Untung Bersih" fill="#14b8a6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
