'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { todayIST } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  Banknote,
  BookOpen,
  Package,
  Leaf,
  AlertTriangle,
  ClipboardList,
  BarChart3,
  Layers,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  PieChart,
  Users,
  User,
  ArrowRight
} from 'lucide-react';
import Link from 'next/link';

function fmt(n: number) {
  return '₹' + (n || 0).toLocaleString('en-IN');
}

export default function OwnerDashboard() {
  const { t } = useLanguage();
  const todayDate = todayIST();

  const { data: allSales } = useQuery({
    queryKey: ['direct_sales'],
    queryFn: async () => {
      const { data, error } = await supabase.from('direct_sales').select('*').is('deleted_at', null);
      if (error) throw error;
      return data || [];
    }
  });

  const { data: allBookings } = useQuery({
    queryKey: ['bookings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('bookings').select('*').is('deleted_at', null);
      if (error) throw error;
      return data || [];
    }
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('*').is('deleted_at', null);
      if (error) return [];
      return data || [];
    }
  });

  const { data: profitSummary } = useQuery({
    queryKey: ['vw_profit_summary', todayDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_profit_summary')
        .select('date, revenue, expenses, profit')
        .eq('date', todayDate)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
  });

  const { data: allLots } = useQuery({
    queryKey: ['lots'],
    queryFn: async () => {
      const { data, error } = await supabase.from('lots').select('*').is('deleted_at', null);
      if (error) throw error;
      return data || [];
    }
  });

  const { data: allPlants } = useQuery({
    queryKey: ['plants'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plants').select('*').is('deleted_at', null).eq('active', true);
      if (error) throw error;
      return data || [];
    }
  });

  const { data: inventory } = useQuery({
    queryKey: ['vw_inventory_status'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vw_inventory_status').select('*');
      if (error) throw error;
      return data || [];
    }
  });

  /* ---- Today's Worker Collections Query ---- */
  const { data: todayWorkerCollections = [] } = useQuery({
    queryKey: ['today_worker_collections', todayDate],
    queryFn: async () => {
      const dayStart = `${todayDate}T00:00:00+05:30`;
      const dayEnd = `${todayDate}T23:59:59.999+05:30`;

      const [salesRes, paymentsRes] = await Promise.all([
        supabase.from('direct_sales').select('*').is('deleted_at', null).gte('created_at', dayStart).lte('created_at', dayEnd),
        supabase.from('booking_payments').select('*').gte('payment_date', dayStart).lte('payment_date', dayEnd)
      ]);

      const sales = salesRes.data || [];
      const payments = paymentsRes.data || [];

      const collectionMap: Record<string, { id: string; name: string; role: string; total: number; cash: number; upi: number; count: number }> = {};

      users.forEach((u: any) => {
        collectionMap[u.id] = { id: u.id, name: u.name, role: u.role, total: 0, cash: 0, upi: 0, count: 0 };
      });

      sales.forEach((s: any) => {
        const wId = s.worker_id;
        if (wId && collectionMap[wId]) {
          const amt = Number(s.amount) || 0;
          collectionMap[wId].total += amt;
          collectionMap[wId].count += 1;
          if (s.payment_mode === 'Cash') collectionMap[wId].cash += amt;
          else if (s.payment_mode === 'UPI') collectionMap[wId].upi += amt;
          else {
            collectionMap[wId].cash += Number(s.cash_amount) || 0;
            collectionMap[wId].upi += Number(s.upi_amount) || 0;
          }
        }
      });

      payments.forEach((p: any) => {
        const wId = p.created_by;
        if (wId && collectionMap[wId]) {
          const c = Number(p.cash_amount) || 0;
          const u = Number(p.upi_amount) || 0;
          collectionMap[wId].cash += c;
          collectionMap[wId].upi += u;
          collectionMap[wId].total += (c + u);
          collectionMap[wId].count += 1;
        }
      });

      return Object.values(collectionMap).filter(w => w.total > 0);
    },
    enabled: users.length > 0
  });

  const productionAlertsCount = (allPlants && allBookings && allLots && inventory)
    ? allPlants.filter((plant) => {
        const totalBooked = allBookings
          .filter((b) => b.plant_id === plant.id && b.status !== 'Cancelled' && b.status !== 'Delivered')
          .reduce((sum, b) => sum + b.quantity, 0);
        const totalGrowing = allLots
          .filter((l) => l.plant_id === plant.id && l.status !== 'Completed')
          .reduce((sum, l) => {
            const inv = inventory.find((i: any) => i.lot_id === l.id);
            return sum + (inv ? inv.free_stock : 0);
          }, 0);
        return totalBooked > totalGrowing;
      }).length
    : null;

  const conflictingLots = (allLots && allBookings && allSales)
    ? allLots.filter((lot) => {
        const deliveredQty = allBookings
          .filter((b) => b.lot_id === lot.id && b.status === 'Delivered')
          .reduce((sum, b) => sum + b.quantity, 0);
        const salesQty = allSales
          .filter((s) => s.lot_id === lot.id)
          .reduce((sum, s) => sum + s.quantity, 0);
        return (deliveredQty + salesQty) > lot.total_quantity;
      })
    : [];

  const todayRevenue = profitSummary?.revenue ?? 0;
  const todayExpenses = profitSummary?.expenses ?? 0;
  const todayProfit = profitSummary?.profit ?? 0;

  const stats = [
    { label: "Today's Revenue", value: fmt(todayRevenue), icon: Banknote, color: 'text-green-700 bg-green-100' },
    { label: "Today's Expenses", value: fmt(todayExpenses), icon: TrendingDown, color: 'text-red-700 bg-red-100' },
    { label: "Today's Profit", value: fmt(todayProfit), icon: TrendingUp, color: todayProfit >= 0 ? 'text-emerald-700 bg-emerald-100' : 'text-red-700 bg-red-100' },
  ];

  const blocks = [
    { href: '/sell', label: t('newSale'), icon: ShoppingCart, color: 'bg-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
    { href: '/bookings/new', label: t('newBooking'), icon: BookOpen, color: 'bg-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    { href: '/plants', label: t('plants'), icon: Leaf, color: 'bg-green-600', bg: 'bg-green-50', border: 'border-green-200' },
    { href: '/lots', label: t('lots'), icon: Layers, color: 'bg-amber-500', bg: 'bg-amber-50', border: 'border-amber-200' },
    { href: '/allotments', label: t('allotments'), icon: ClipboardList, color: 'bg-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
    { href: '/fulfillment', label: t('fulfillment'), icon: Package, color: 'bg-pink-600', bg: 'bg-pink-50', border: 'border-pink-200' },
    { href: '/calculator', label: t('calculator'), icon: TrendingUp, color: 'bg-teal-600', bg: 'bg-teal-50', border: 'border-teal-200' },
    { href: '/notebook', label: t('ledger'), icon: BookOpen, color: 'bg-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
    { href: '/reports', label: t('reports'), icon: BarChart3, color: 'bg-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
    { href: '/analytics', label: t('analytics'), icon: PieChart, color: 'bg-sky-600', bg: 'bg-sky-50', border: 'border-sky-200' },
    { href: '/staff', label: t('manageStaff'), icon: Users, color: 'bg-red-600', bg: 'bg-red-50', border: 'border-red-200' },
    { href: '/settings/qr', label: 'Manage QRs', icon: Banknote, color: 'bg-fuchsia-600', bg: 'bg-fuchsia-50', border: 'border-fuchsia-200' },
  ];

  return (
    <div className="space-y-6 pb-20">
      <header className="flex justify-between items-center mb-2">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">{t('Owner Dashboard')}</h1>
      </header>
      
      {/* ── Live Stat Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${stat.color}`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div className="mt-4">
              <p className="text-2xl font-black text-gray-900 tracking-tight">{stat.value}</p>
              <p className="text-xs font-semibold text-gray-500 mt-1 uppercase tracking-wider">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Grid Blocks (No Scrolling) ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {blocks.map((b, i) => (
          <Link 
            key={i} 
            href={b.href}
            className={`${b.bg} border ${b.border} rounded-2xl p-4 flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform shadow-sm min-h-[100px]`}
          >
            <div className={`${b.color} text-white p-3 rounded-2xl shadow-sm`}>
              <b.icon className="w-6 h-6" />
            </div>
            <span className="text-sm font-bold text-gray-900 text-center leading-tight">{b.label}</span>
          </Link>
        ))}
      </div>

      {/* ── Today's Worker Sales & Collections (Owner Visibility) ───────── */}
      {todayWorkerCollections.length > 0 && (
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-purple-600" />
              <h2 className="text-sm font-black text-gray-900">Today&apos;s Worker Collections</h2>
            </div>
            <Link href="/transactions" className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {todayWorkerCollections.map((w) => (
              <Link
                key={w.id}
                href="/transactions"
                className="p-3.5 bg-gray-50/90 rounded-2xl border border-gray-150 hover:bg-gray-100 transition-all flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-black text-gray-900 text-xs">{w.name}</p>
                    <span className="text-[9px] font-bold text-gray-400 bg-gray-200/80 px-1.5 py-0.2 rounded">{w.role}</span>
                  </div>
                  <p className="text-[10px] font-semibold text-gray-500 mt-1">
                    {w.count} txns &middot; 💵 {fmt(w.cash)} &middot; 📱 {fmt(w.upi)}
                  </p>
                </div>
                <strong className="text-sm font-black text-green-700">{fmt(w.total)}</strong>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Production Alerts Block ────────────────────────────────────── */}
      {productionAlertsCount !== null && productionAlertsCount > 0 ? (
        <Link href="/reports?tab=production" className="block bg-red-50 rounded-2xl shadow-sm border border-red-200 p-5 active:scale-95 transition-transform">
          <div className="flex items-center gap-3">
            <div className="bg-red-100 text-red-600 p-3 rounded-2xl">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-red-800 text-lg">{t('productionAlerts')}</h2>
              <p className="text-sm font-semibold text-red-600 mt-0.5">{productionAlertsCount} {t('propagationNeed')}</p>
            </div>
          </div>
        </Link>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 flex items-center gap-3 shadow-sm">
          <Leaf className="w-5 h-5 text-green-600 shrink-0" />
          <p className="text-sm font-bold text-green-700">{t('allStockSufficient')}</p>
        </div>
      )}

      {/* ── Conflict Alerts Block ────────────────────────────────────── */}
      {conflictingLots.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="bg-orange-100 text-orange-600 p-3 rounded-2xl">
              <AlertTriangle className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h2 className="font-bold text-orange-850 text-lg">Inventory Stock Conflicts!</h2>
              <p className="text-sm font-semibold text-orange-700 mt-0.5">
                {conflictingLots.length} lot(s) have negative stock due to offline sync overlaps.
              </p>
            </div>
          </div>
          <div className="divide-y divide-orange-100 bg-white rounded-xl p-3 border border-orange-100">
            {conflictingLots.map((lot) => (
              <div key={lot.id} className="py-2 first:pt-0 last:pb-0 flex justify-between items-center text-xs">
                <div>
                  <p className="font-bold text-gray-800">{lot.lot_name || lot.lot_number}</p>
                  <p className="text-gray-400 font-semibold mt-0.5">Physical sales exceed surviving saplings.</p>
                </div>
                <Link href={`/lots/${lot.id}/edit`} className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg font-black transition-colors">
                  Fix
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── View All Transactions ──────────────────────────────────────── */}
      <Link href="/transactions" className="bg-white border border-gray-100 rounded-2xl px-5 py-4 flex items-center justify-between shadow-sm active:scale-95 transition-transform">
        <div className="flex items-center gap-3">
          <div className="bg-gray-100 p-2 rounded-xl">
            <ClipboardList className="w-5 h-5 text-gray-600" />
          </div>
          <span className="font-bold text-gray-800">View All Transactions</span>
        </div>
        <span className="text-gray-400">→</span>
      </Link>
    </div>
  );
}
