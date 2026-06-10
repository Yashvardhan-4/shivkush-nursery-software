'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';

export default function AnalyticsClient() {
  const { t } = useLanguage();
  const [timeRange, setTimeRange] = useState<'all' | 'month'>('all');

  const bookings = useLiveQuery(() => db.bookings.toArray());
  const directSales = useLiveQuery(() => db.direct_sales.toArray());
  const plants = useLiveQuery(() => db.plants.toArray());

  if (!bookings || !directSales || !plants) {
    return <div className="text-center py-10">Loading analytics...</div>;
  }

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const isCurrentMonth = (dateStr: string) => dateStr.startsWith(currentMonthStr);

  const filterData = (data: any[]) => timeRange === 'all' 
    ? data 
    : data.filter(d => isCurrentMonth(d.booking_date || d.created_at));

  const filteredBookings = filterData(bookings);
  const filteredSales = filterData(directSales);

  // 1. Overall Metrics
  const totalRevenue = 
    filteredBookings.reduce((sum, b) => sum + b.total_amount, 0) +
    filteredSales.reduce((sum, s) => sum + s.amount, 0);
  
  const totalAdvances = filteredBookings.reduce((sum, b) => sum + b.advance_paid, 0);
  const pendingAdvances = filteredBookings.reduce((sum, b) => sum + Math.max(0, b.total_amount - b.advance_paid), 0);

  // 2. Monthly Trend Aggregation
  const monthlyRevenueMap: Record<string, number> = {};
  
  const processMonthly = (items: any[], dateField: string, amountField: string) => {
    items.forEach(item => {
      const month = item[dateField].substring(0, 7); // YYYY-MM
      monthlyRevenueMap[month] = (monthlyRevenueMap[month] || 0) + item[amountField];
    });
  };
  processMonthly(bookings, 'booking_date', 'total_amount');
  processMonthly(directSales, 'created_at', 'amount');

  const monthlyTrendData = Object.keys(monthlyRevenueMap).sort().map(month => ({
    name: month,
    Revenue: monthlyRevenueMap[month]
  }));

  // 3. Top Selling Plants
  const plantSalesMap: Record<string, number> = {};
  filteredBookings.forEach(b => plantSalesMap[b.plant_id] = (plantSalesMap[b.plant_id] || 0) + b.quantity);
  filteredSales.forEach(s => plantSalesMap[s.plant_id] = (plantSalesMap[s.plant_id] || 0) + s.quantity);

  const topPlantsData = Object.keys(plantSalesMap)
    .map(id => ({
      name: plants.find(p => p.id === id)?.plant_name || 'Unknown',
      value: plantSalesMap[id]
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5); // Top 5

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  // 4. Payment Breakdown (Direct Sales)
  const paymentBreakdownMap: Record<string, number> = { Cash: 0, UPI: 0, Split: 0 };
  filteredSales.forEach(s => {
    if (s.payment_mode === 'Cash') paymentBreakdownMap.Cash += s.amount;
    else if (s.payment_mode === 'UPI') paymentBreakdownMap.UPI += s.amount;
    else if (s.payment_mode === 'Split') {
       paymentBreakdownMap.Cash += (s.cash_amount || 0);
       paymentBreakdownMap.UPI += (s.upi_amount || 0);
    }
  });

  const paymentData = [
    { name: t('cash'), value: paymentBreakdownMap.Cash },
    { name: t('upi'), value: paymentBreakdownMap.UPI }
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Time Range Filter */}
      <div className="flex gap-2 bg-gray-100 p-1 w-max rounded-xl">
        <button 
          onClick={() => setTimeRange('all')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${timeRange === 'all' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
        >
          {t('allTime')}
        </button>
        <button 
          onClick={() => setTimeRange('month')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${timeRange === 'month' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
        >
          {t('thisMonth')}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('totalRevenue')}</p>
          <p className="text-2xl font-black text-blue-600 mt-1">₹{totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('totalBookings')}</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{filteredBookings.length}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('pendingAdvance')}</p>
          <p className="text-2xl font-black text-red-500 mt-1">₹{pendingAdvances.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('directSales')}</p>
          <p className="text-2xl font-black text-green-600 mt-1">{filteredSales.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4">{t('monthByMonth')}</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrendData}>
                <XAxis dataKey="name" tick={{fontSize: 12}} />
                <YAxis tick={{fontSize: 12}} width={80} />
                <RechartsTooltip cursor={{fill: '#f3f4f6'}} />
                <Bar dataKey="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Plants Chart */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4">{t('topPlants')}</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={topPlantsData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                >
                  {topPlantsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Breakdown */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4">{t('paymentBreakdown')}</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={paymentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill="#10b981" /> {/* Cash = Green */}
                  <Cell fill="#8b5cf6" /> {/* UPI = Purple */}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
