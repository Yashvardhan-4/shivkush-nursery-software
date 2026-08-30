'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { Banknote, ShoppingCart, BookOpen, User, Calendar, Award } from 'lucide-react';

export default function AnalyticsClient() {
  const { t } = useLanguage();
  const [timeRange, setTimeRange] = useState<'month' | 'all' | 'custom'>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: queriesData, isLoading } = useQuery({
    queryKey: ['analytics-data'],
    queryFn: async () => {
      const [bRes, sRes, pRes, uRes, invRes] = await Promise.all([
        supabase.from('bookings').select('*').is('deleted_at', null),
        supabase.from('direct_sales').select('*').is('deleted_at', null),
        supabase.from('plants').select('*').is('deleted_at', null),
        supabase.from('users').select('*').is('deleted_at', null),
        supabase.from('vw_inventory_status').select('*')
      ]);

      return {
        bookings: bRes.data || [],
        directSales: sRes.data || [],
        plants: pRes.data || [],
        users: uRes.data || [],
        inventory: invRes.data || []
      };
    }
  });

  const { bookings = [], directSales = [], plants = [], users = [] } = queriesData || {};

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Helper to filter dates
  const isDateInRange = (dateVal: any) => {
    if (!dateVal) return false;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return false;
    
    if (timeRange === 'month') {
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    } else if (timeRange === 'custom') {
      if (!startDate || !endDate) return true;
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    }
    return true; // 'all'
  };

  const filteredBookings = useMemo(() => {
    if (timeRange === 'all') return bookings;
    return bookings.filter(b => isDateInRange(b.booking_date || b.created_at));
  }, [bookings, timeRange, startDate, endDate]);

  const filteredSales = useMemo(() => {
    if (timeRange === 'all') return directSales;
    return directSales.filter(s => isDateInRange(s.created_at));
  }, [directSales, timeRange, startDate, endDate]);

  const validBookings = useMemo(() => {
    return filteredBookings.filter(b => b.status !== 'Cancelled');
  }, [filteredBookings]);

  // 1. Overall Metrics
  const totalRevenue = useMemo(() => {
    const bTotal = validBookings.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0);
    const sTotal = filteredSales.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    return bTotal + sTotal;
  }, [validBookings, filteredSales]);

  const totalAdvanceCollected = useMemo(() => {
    return validBookings.reduce((sum, b) => sum + (Number(b.advance_paid) || 0), 0);
  }, [validBookings]);

  const pendingBalanceDue = useMemo(() => {
    return validBookings.reduce((sum, b) => sum + Math.max(0, (Number(b.total_amount) || 0) - (Number(b.advance_paid) || 0)), 0);
  }, [validBookings]);

  const totalSaplingsSold = useMemo(() => {
    const bQty = validBookings.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
    const sQty = filteredSales.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
    return bQty + sQty;
  }, [validBookings, filteredSales]);

  // 2. Trend Chart Data (Day-by-Day for Month, Month-by-Month for All-Time)
  const trendData = useMemo(() => {
    interface TrendItem {
      key: string;
      label: string;
      Sales: number;
      Bookings: number;
      Revenue: number;
    }

    if (timeRange === 'month') {
      // Day-by-Day for current month
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      const dailyMap: Record<number, TrendItem> = {};

      for (let day = 1; day <= daysInMonth; day++) {
        dailyMap[day] = {
          key: `day-${day}`,
          label: `${day}`,
          Sales: 0,
          Bookings: 0,
          Revenue: 0
        };
      }

      filteredSales.forEach(s => {
        const d = new Date(s.created_at);
        if (!isNaN(d.getTime()) && d.getMonth() === currentMonth) {
          const day = d.getDate();
          if (dailyMap[day]) {
            const amt = Number(s.amount) || 0;
            dailyMap[day].Sales += amt;
            dailyMap[day].Revenue += amt;
          }
        }
      });

      validBookings.forEach(b => {
        const d = new Date(b.booking_date || b.created_at);
        if (!isNaN(d.getTime()) && d.getMonth() === currentMonth) {
          const day = d.getDate();
          if (dailyMap[day]) {
            const amt = Number(b.total_amount) || 0;
            dailyMap[day].Bookings += amt;
            dailyMap[day].Revenue += amt;
          }
        }
      });

      return Object.values(dailyMap) as TrendItem[];
    } else {
      // Month-by-Month for All Time or Custom
      const monthlyMap: Record<string, TrendItem> = {};

      const processItem = (dateVal: string, amount: number, isSale: boolean) => {
        if (!dateVal) return;
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

        if (!monthlyMap[key]) {
          monthlyMap[key] = { key, label, Sales: 0, Bookings: 0, Revenue: 0 };
        }
        if (isSale) {
          monthlyMap[key].Sales += amount;
        } else {
          monthlyMap[key].Bookings += amount;
        }
        monthlyMap[key].Revenue += amount;
      };

      filteredSales.forEach(s => processItem(s.created_at, Number(s.amount) || 0, true));
      validBookings.forEach(b => processItem(b.booking_date || b.created_at, Number(b.total_amount) || 0, false));

      return Object.keys(monthlyMap).sort().map(k => monthlyMap[k]) as TrendItem[];
    }
  }, [timeRange, filteredSales, validBookings, currentYear, currentMonth]);

  // 3. Top Selling Plants
  const topPlantsData = useMemo(() => {
    const plantQtyMap: Record<string, { name: string; quantity: number; revenue: number }> = {};

    validBookings.forEach(b => {
      if (!b.plant_id) return;
      if (!plantQtyMap[b.plant_id]) {
        const plant = plants.find(p => p.id === b.plant_id);
        const name = plant ? `${plant.plant_name}${plant.variety ? ' (' + plant.variety + ')' : ''}` : 'Unknown';
        plantQtyMap[b.plant_id] = { name, quantity: 0, revenue: 0 };
      }
      plantQtyMap[b.plant_id].quantity += Number(b.quantity) || 0;
      plantQtyMap[b.plant_id].revenue += Number(b.total_amount) || 0;
    });

    filteredSales.forEach(s => {
      if (!s.plant_id) return;
      if (!plantQtyMap[s.plant_id]) {
        const plant = plants.find(p => p.id === s.plant_id);
        const name = plant ? `${plant.plant_name}${plant.variety ? ' (' + plant.variety + ')' : ''}` : 'Unknown';
        plantQtyMap[s.plant_id] = { name, quantity: 0, revenue: 0 };
      }
      plantQtyMap[s.plant_id].quantity += Number(s.quantity) || 0;
      plantQtyMap[s.plant_id].revenue += Number(s.amount) || 0;
    });

    return Object.values(plantQtyMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [validBookings, filteredSales, plants]);

  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899'];

  // 4. Payment Breakdown (Direct Sales + Bookings Advance)
  const paymentData = useMemo(() => {
    let totalCash = 0;
    let totalUpi = 0;

    filteredSales.forEach(s => {
      if (s.payment_mode === 'Cash') totalCash += Number(s.amount) || 0;
      else if (s.payment_mode === 'UPI') totalUpi += Number(s.amount) || 0;
      else if (s.payment_mode === 'Split') {
        totalCash += Number(s.cash_amount) || 0;
        totalUpi += Number(s.upi_amount) || 0;
      }
    });

    validBookings.forEach(b => {
      if (b.advance_payment_mode === 'Cash') totalCash += Number(b.advance_paid) || 0;
      else if (b.advance_payment_mode === 'UPI') totalUpi += Number(b.advance_paid) || 0;
      else {
        totalCash += Number(b.advance_cash_amount) || 0;
        totalUpi += Number(b.advance_upi_amount) || 0;
      }
    });

    return [
      { name: 'Cash', value: totalCash, color: '#10b981' },
      { name: 'UPI', value: totalUpi, color: '#3b82f6' }
    ].filter(d => d.value > 0);
  }, [filteredSales, validBookings]);

  // 5. Worker Sales Contribution
  const workerContributions = useMemo(() => {
    const workerMap: Record<string, { id: string; name: string; role: string; totalSales: number; salesCount: number; cash: number; upi: number }> = {};

    users.forEach(u => {
      workerMap[u.id] = {
        id: u.id,
        name: u.name,
        role: u.role,
        totalSales: 0,
        salesCount: 0,
        cash: 0,
        upi: 0
      };
    });

    filteredSales.forEach(s => {
      const wId = s.worker_id;
      if (wId && workerMap[wId]) {
        const amt = Number(s.amount) || 0;
        workerMap[wId].totalSales += amt;
        workerMap[wId].salesCount += 1;
        if (s.payment_mode === 'Cash') workerMap[wId].cash += amt;
        else if (s.payment_mode === 'UPI') workerMap[wId].upi += amt;
        else {
          workerMap[wId].cash += Number(s.cash_amount) || 0;
          workerMap[wId].upi += Number(s.upi_amount) || 0;
        }
      }
    });

    validBookings.forEach(b => {
      const wId = b.worker_id;
      if (wId && workerMap[wId]) {
        const adv = Number(b.advance_paid) || 0;
        workerMap[wId].totalSales += adv;
        workerMap[wId].salesCount += 1;
        if (b.advance_payment_mode === 'Cash') workerMap[wId].cash += adv;
        else if (b.advance_payment_mode === 'UPI') workerMap[wId].upi += adv;
        else {
          workerMap[wId].cash += Number(b.advance_cash_amount) || 0;
          workerMap[wId].upi += Number(b.advance_upi_amount) || 0;
        }
      }
    });

    return Object.values(workerMap)
      .filter(w => w.totalSales > 0 || w.salesCount > 0)
      .sort((a, b) => b.totalSales - a.totalSales);
  }, [users, filteredSales, validBookings]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Time Range Filter Tabs */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1.5 bg-gray-100 p-1 rounded-2xl shadow-inner">
          <button 
            onClick={() => setTimeRange('month')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              timeRange === 'month' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            This Month
          </button>
          <button 
            onClick={() => setTimeRange('all')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              timeRange === 'all' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            All Time
          </button>
          <button 
            onClick={() => setTimeRange('custom')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              timeRange === 'custom' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Custom Range
          </button>
        </div>

        {timeRange === 'custom' && (
          <div className="flex gap-2 items-center bg-white p-1.5 rounded-xl border border-gray-200 text-xs">
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
              className="px-2 py-1 bg-gray-50 border rounded-lg font-bold"
            />
            <span className="text-gray-400 font-bold">to</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
              className="px-2 py-1 bg-gray-50 border rounded-lg font-bold"
            />
          </div>
        )}
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-1">
            <Banknote className="w-4 h-4 text-green-600" /> Total Revenue
          </div>
          <p className="text-2xl font-black text-gray-900">₹{totalRevenue.toLocaleString('en-IN')}</p>
          <p className="text-[11px] text-gray-400 font-medium mt-1">Direct Sales + Bookings</p>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-1">
            <ShoppingCart className="w-4 h-4 text-purple-600" /> Direct Sales
          </div>
          <p className="text-2xl font-black text-purple-700">{filteredSales.length}</p>
          <p className="text-[11px] text-gray-400 font-medium mt-1">Walk-in transactions</p>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-1">
            <BookOpen className="w-4 h-4 text-blue-600" /> Bookings
          </div>
          <p className="text-2xl font-black text-blue-700">{validBookings.length}</p>
          <p className="text-[11px] text-gray-400 font-medium mt-1">₹{totalAdvanceCollected.toLocaleString('en-IN')} Advance collected</p>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase mb-1">
            <Award className="w-4 h-4 text-amber-500" /> Total Saplings
          </div>
          <p className="text-2xl font-black text-gray-900">{totalSaplingsSold.toLocaleString('en-IN')}</p>
          <p className="text-[11px] text-gray-400 font-medium mt-1">Plants sold/booked</p>
        </div>
      </div>

      {/* Primary Trend Chart */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-black text-gray-900">
              {timeRange === 'month' ? 'Day-by-Day Revenue (This Month)' : 'Month-by-Month Revenue Trend'}
            </h3>
            <p className="text-xs font-medium text-gray-400">
              {timeRange === 'month' 
                ? `${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} daily breakdown`
                : 'Aggregated revenue over time'}
            </p>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => `₹${v}`} />
              <RechartsTooltip 
                formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Revenue']}
                cursor={{ fill: '#f3f4f6' }}
              />
              <Bar dataKey="Revenue" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two-Column Grid for Plants and Payment Share */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Selling Plants */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-4">
          <h3 className="text-lg font-black text-gray-900">Top Selling Varieties</h3>
          <p className="text-xs text-gray-400 font-medium">Most ordered saplings by volume</p>

          {topPlantsData.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-xs font-medium">No sales data recorded yet</div>
          ) : (
            <div className="space-y-3 pt-2">
              {topPlantsData.map((plant, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-gray-800">
                    <span className="truncate pr-2">{plant.name}</span>
                    <span className="shrink-0">{plant.quantity.toLocaleString('en-IN')} units</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (plant.quantity / (topPlantsData[0]?.quantity || 1)) * 100)}%`,
                        backgroundColor: COLORS[idx % COLORS.length]
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment Mode Distribution */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-4">
          <h3 className="text-lg font-black text-gray-900">Payment Mode Share</h3>
          <p className="text-xs text-gray-400 font-medium">Cash vs UPI distribution</p>

          {paymentData.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-xs font-medium">No payment data recorded yet</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {paymentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(v: any) => `₹${Number(v).toLocaleString('en-IN')}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Staff Collections & Contribution */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-4">
        <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <User className="w-5 h-5 text-indigo-600" /> Staff Collections & Contribution
        </h3>
        <p className="text-xs text-gray-400 font-medium">Breakdown of revenue recorded by each worker</p>

        {workerContributions.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-xs font-medium">No worker collections in this timeframe</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {workerContributions.map((w) => (
              <div key={w.id} className="p-4 bg-gray-50/80 rounded-2xl border border-gray-100 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-gray-900 text-sm">{w.name}</h4>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">{w.role} · {w.salesCount} transactions</span>
                  </div>
                  <strong className="text-base font-black text-green-700">₹{w.totalSales.toLocaleString('en-IN')}</strong>
                </div>
                <div className="flex gap-2 text-xs pt-1 border-t border-gray-200/60">
                  <span className="text-[11px] font-semibold text-gray-500">💵 Cash: ₹{w.cash.toLocaleString('en-IN')}</span>
                  <span className="text-[11px] font-semibold text-gray-500">📱 UPI: ₹{w.upi.toLocaleString('en-IN')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
