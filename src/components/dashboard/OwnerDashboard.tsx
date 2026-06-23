'use client';

import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, toLocalDateStr } from '@/lib/db';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  Banknote,
  BookOpen,
  Leaf,
  AlertTriangle,
  ClipboardList,
  BarChart3,
  Layers,
  ShoppingCart,
  TrendingUp,
  PieChart,
  Users
} from 'lucide-react';
import Link from 'next/link';

import { SyncButton } from '@/components/ui/SyncButton';

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN');
}
function today() {
  return toLocalDateStr();
}

export default function OwnerDashboard() {
  const { t } = useLanguage();
  const todayStr = today();

  const allSales = useLiveQuery(async () => (await db.direct_sales.toArray()).filter(s => !s.deleted_at));
  const allBookings = useLiveQuery(async () => (await db.bookings.toArray()).filter(b => !b.deleted_at));
  const allLots = useLiveQuery(async () => (await db.lots.toArray()).filter(l => !l.deleted_at));
  const allPlants = useLiveQuery(async () => {
    const all = await db.plants.toArray();
    return all.filter(p => p.active && !p.deleted_at);
  });

  const [ownerId, setOwnerId] = useState<string | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('snms_user');
    if (userStr) {
       const user = JSON.parse(userStr);
       setOwnerId(user.id);
    }
  }, []);

  // Today's total income = direct sales + balance collected at delivery + advances collected today - refunds issued today
  const todaySalesTotal = (allSales && allBookings)
    ? (allSales
        .filter((s) => s.created_at && toLocalDateStr(s.created_at) === todayStr)
        .reduce((sum, s) => sum + Number(s.amount || 0), 0)
      + allBookings
        .filter((b) => b.delivery_date === todayStr && b.status === 'Delivered')
        .reduce((sum, b) => sum + Math.max(0, Number(b.total_amount || 0) - Number(b.advance_paid || 0)), 0)
      + allBookings
        .filter((b) => b.created_at && toLocalDateStr(b.created_at) === todayStr)
        .reduce((sum, b) => sum + Number(b.advance_paid || 0), 0))
      - allBookings
        .filter((b) => b.status === 'Cancelled' && b.refund_status === 'Refunded' && b.refund_date === todayStr)
        .reduce((sum, b) => sum + Number(b.refund_amount || 0), 0)
    : null;

  // Owner's sales = income from transactions by the owner user - refunds issued today
  const ownerSalesTotal = (allSales && allBookings && ownerId)
    ? (allSales
        .filter((s) => s.created_at && toLocalDateStr(s.created_at) === todayStr && s.worker_id === ownerId)
        .reduce((sum, s) => sum + Number(s.amount || 0), 0)
      + allBookings
        .filter((b) => b.delivery_date === todayStr && b.status === 'Delivered' && b.worker_id === ownerId)
        .reduce((sum, b) => sum + Math.max(0, Number(b.total_amount || 0) - Number(b.advance_paid || 0)), 0)
      + allBookings
        .filter((b) => b.created_at && toLocalDateStr(b.created_at) === todayStr && b.worker_id === ownerId)
        .reduce((sum, b) => sum + Number(b.advance_paid || 0), 0))
      - allBookings
        .filter((b) => b.status === 'Cancelled' && b.refund_status === 'Refunded' && b.refund_date === todayStr)
        .reduce((sum, b) => sum + Number(b.refund_amount || 0), 0)
    : null;

  const pendingBookingsCount = allBookings
    ? new Set(
        allBookings
          .filter((b) => b.status === 'Pending')
          .map((b) => b.booking_number)
      ).size
    : null;

  const readyLotsCount = allLots
    ? allLots.filter((l) => l.status === 'Ready').length
    : null;

  const productionAlertsCount = (allPlants && allBookings && allLots)
    ? allPlants.filter((plant) => {
        const totalBooked = allBookings
          .filter((b) => b.plant_id === plant.id && b.status !== 'Cancelled' && b.status !== 'Delivered')
          .reduce((sum, b) => sum + b.quantity, 0);
        const totalGrowing = allLots
          .filter((l) => l.plant_id === plant.id && l.status !== 'Completed')
          .reduce((sum, l) => sum + (l.available_stock ?? l.total_quantity), 0);
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

  const stats = [
    { label: "Today's Total Income", value: todaySalesTotal !== null ? fmt(todaySalesTotal) : '…', icon: Banknote, color: 'text-green-700 bg-green-100' },
    { label: "My Sales (Owner)", value: ownerSalesTotal !== null ? fmt(ownerSalesTotal) : (ownerId ? '…' : 'N/A'), icon: Banknote, color: 'text-emerald-700 bg-emerald-100' },
    { label: t('pending'), value: pendingBookingsCount !== null ? String(pendingBookingsCount) : '…', icon: BookOpen, color: 'text-blue-700 bg-blue-100' },
  ];

  const blocks = [
    { href: '/sell', label: t('newSale'), icon: ShoppingCart, color: 'bg-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
    { href: '/bookings/new', label: t('newBooking'), icon: BookOpen, color: 'bg-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    { href: '/plants', label: t('plants'), icon: Leaf, color: 'bg-green-600', bg: 'bg-green-50', border: 'border-green-200' },
    { href: '/lots', label: t('lots'), icon: Layers, color: 'bg-amber-500', bg: 'bg-amber-50', border: 'border-amber-200' },
    { href: '/allotments', label: t('allotments'), icon: ClipboardList, color: 'bg-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
    { href: '/calculator', label: t('calculator'), icon: TrendingUp, color: 'bg-teal-600', bg: 'bg-teal-50', border: 'border-teal-200' },
    { href: '/notebook', label: t('ledger'), icon: BookOpen, color: 'bg-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
    { href: '/reports', label: t('reports'), icon: BarChart3, color: 'bg-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
    { href: '/analytics', label: t('analytics'), icon: PieChart, color: 'bg-sky-600', bg: 'bg-sky-50', border: 'border-sky-200' },
    { href: '/staff', label: t('manageStaff'), icon: Users, color: 'bg-red-600', bg: 'bg-red-50', border: 'border-red-200' },
    { href: '/settings/qr', label: 'Manage QRs', icon: Banknote, color: 'bg-pink-600', bg: 'bg-pink-50', border: 'border-pink-200' },
  ];

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center mb-2">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">{t('Owner Dashboard')}</h1>
        <SyncButton />
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
