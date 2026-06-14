'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, toLocalDateStr } from '@/lib/db';
import { Banknote, PlusCircle, BookOpen, Layers, Leaf, Package } from 'lucide-react';
import Link from 'next/link';
import { SyncButton } from '@/components/ui/SyncButton';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function WorkerDashboard() {
  const [workerId, setWorkerId] = useState<string | undefined>();

  useEffect(() => {
    const userStr = localStorage.getItem('snms_user');
    if (userStr) setWorkerId(JSON.parse(userStr).id);
  }, []);

  const todaySalesTotal = useLiveQuery(async () => {
    const todayStr = toLocalDateStr();
    const userStr = localStorage.getItem('snms_user');
    const user = userStr ? JSON.parse(userStr) : null;
    const workerId = user?.id;

    const [allSales, allBookings] = await Promise.all([
      db.direct_sales.toArray(),
      db.bookings.toArray()
    ]);
    
    return allSales
        .filter((s) => s.created_at && toLocalDateStr(s.created_at) === todayStr && s.worker_id === workerId)
        .reduce((sum, s) => sum + s.amount, 0)
      + allBookings
        .filter((b) => b.delivery_date === todayStr && b.status === 'Delivered' && b.worker_id === workerId)
        .reduce((sum, b) => sum + Math.max(0, b.total_amount - (b.advance_paid || 0)), 0)
      + allBookings
        .filter((b) => ((b.created_at && toLocalDateStr(b.created_at) === todayStr) || (!b.created_at && b.booking_date === todayStr)) && b.worker_id === workerId)
        .reduce((sum, b) => sum + (b.advance_paid || 0), 0);
  });

  // Free stock computation per plant
  const freeStockData = useLiveQuery(async () => {
    const [plants, lots, allotments, bookings, sales] = await Promise.all([
      db.plants.toArray(),
      db.lots.toArray(),
      db.allotments.toArray(),
      db.bookings.toArray(),
      db.direct_sales.toArray(),
    ]);

    return plants
      .map(plant => {
        let freeStock = 0;
        let totalStock = 0;
        let allottedQty = 0;

        lots.filter(l => l.plant_id === plant.id && l.status !== 'Completed').forEach(lot => {
          const lotTotal = lot.available_stock ?? lot.total_quantity;
          const lotBookings = bookings.filter(b => b.lot_id === lot.id);
          
          const activeBookingIds = new Set(
            lotBookings.filter(b => b.status !== 'Delivered' && b.status !== 'Cancelled').map(b => b.id)
          );
          const allottedInLot = allotments.filter(a => a.lot_id === lot.id && activeBookingIds.has(a.booking_id)).reduce((s, a) => s + a.quantity, 0);
          const deliveredInLot = lotBookings.filter(b => b.status === 'Delivered').reduce((s, b) => s + b.quantity, 0);
          const salesInLot = sales.filter(s => s.lot_id === lot.id).reduce((s, sale) => s + sale.quantity, 0);
          
          freeStock += Math.max(0, lotTotal - allottedInLot - deliveredInLot - salesInLot);
          totalStock += lotTotal;
          allottedQty += allottedInLot;
        });

        return { plant, totalStock, allottedQty, freeStock };
      })
      .filter(item => item.totalStock > 0);
  });

  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center mb-2">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">{t('Worker Dashboard')}</h1>
        <SyncButton />
      </header>

      {/* Today's Sales Hero Card */}
      <div className="bg-gradient-to-br from-green-500 to-green-700 p-8 rounded-3xl shadow-xl text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Banknote className="w-32 h-32 transform rotate-12" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center space-x-3 opacity-90 mb-3">
            <Banknote className="w-5 h-5" />
            <span className="text-sm font-bold uppercase tracking-wider">{t('todaysSales')}</span>
          </div>
          <p className="text-5xl font-black tracking-tighter">
            ₹{(todaySalesTotal ?? 0).toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 gap-4 mt-8">
        <Link href="/sell" className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-5 active:scale-95 transition-all">
          <div className="bg-green-100 p-4 rounded-2xl text-green-600 shadow-inner">
            <PlusCircle className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">{t('sell')}</h3>
            <p className="text-xs font-medium text-gray-500 mt-1">{t('sellSub')}</p>
          </div>
        </Link>

        <Link href="/fulfillment" className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-5 active:scale-95 transition-all">
          <div className="bg-indigo-100 p-4 rounded-2xl text-indigo-600 shadow-inner">
            <Package className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">My Orders</h3>
            <p className="text-xs font-medium text-gray-500 mt-1">View and fulfill assigned orders</p>
          </div>
        </Link>

        <Link href="/bookings" className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-5 active:scale-95 transition-all">
          <div className="bg-blue-100 p-4 rounded-2xl text-blue-600 shadow-inner">
            <BookOpen className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">{t('manageBookings')}</h3>
            <p className="text-xs font-medium text-gray-500 mt-1">{t('manageBookingsSub')}</p>
          </div>
        </Link>

        <Link href="/lots" className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-5 active:scale-95 transition-all">
          <div className="bg-orange-100 p-4 rounded-2xl text-orange-600 shadow-inner">
            <Layers className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">{t('viewStock')}</h3>
            <p className="text-xs font-medium text-gray-500 mt-1">{t('viewStockSub')}</p>
          </div>
        </Link>

        <Link href="/transactions" className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-5 active:scale-95 transition-all">
          <div className="bg-emerald-100 p-4 rounded-2xl text-emerald-600 shadow-inner">
            <Banknote className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">{t('collections')}</h3>
            <p className="text-xs font-medium text-gray-500 mt-1">View my collections and transaction history</p>
          </div>
        </Link>
      </div>

      {/* Free Stock by Plant Section */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2 px-1">
          <Leaf className="w-5 h-5 text-green-600" />
          <h2 className="font-black text-gray-800 text-lg">{t('freeStockByPlant')}</h2>
        </div>

        {!freeStockData && (
          <p className="text-sm text-gray-400 text-center py-4">{t('loadingStock')}</p>
        )}

        {freeStockData && freeStockData.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">{t('noPlantStock')}</p>
        )}

        {freeStockData && freeStockData.map(({ plant, totalStock, allottedQty, freeStock }) => (
          <div
            key={plant.id}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between"
          >
            <div>
              <p className="font-extrabold text-gray-900 text-base">{plant.plant_name}</p>
              <p className="text-xs font-medium text-gray-400 mt-0.5">{plant.variety} · {t('stock')}: {totalStock}</p>
            </div>
            <div className="flex items-center space-x-3 text-right">
              {allottedQty > 0 && (
                <div className="text-center">
                  <p className="text-xs font-bold text-red-500 uppercase tracking-wide">{t('booked')}</p>
                  <p className="text-lg font-black text-red-500">{allottedQty}</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-xs font-bold text-green-600 uppercase tracking-wide">{t('free')}</p>
                <p className="text-2xl font-black text-green-600">{freeStock}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
