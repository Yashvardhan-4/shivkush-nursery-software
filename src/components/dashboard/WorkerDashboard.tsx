'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Banknote, PlusCircle, BookOpen, Layers, Leaf } from 'lucide-react';
import Link from 'next/link';

export default function WorkerDashboard() {
  const todaySalesTotal = useLiveQuery(async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const userStr = localStorage.getItem('snms_user');
    const user = userStr ? JSON.parse(userStr) : null;
    const workerId = user?.id;

    const [allSales, allBookings] = await Promise.all([
      db.direct_sales.toArray(),
      db.bookings.toArray()
    ]);
    
    return allSales
        .filter((s) => s.created_at.startsWith(todayStr) && s.worker_id === workerId)
        .reduce((sum, s) => sum + s.amount, 0)
      + allBookings
        .filter((b) => b.delivery_date === todayStr && b.status === 'Delivered' && b.worker_id === workerId)
        .reduce((sum, b) => sum + Math.max(0, b.total_amount - (b.advance_paid || 0)), 0)
      + allBookings
        .filter((b) => b.created_at?.startsWith(todayStr) && b.worker_id === workerId)
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
        const totalStock = lots
          .filter(l => l.plant_id === plant.id)
          .reduce((s, l) => s + l.total_quantity, 0);

        // Allotted qty: find bookings for this plant, then sum allotments for those bookings
        const plantBookingIds = new Set(
          bookings.filter(b => b.plant_id === plant.id).map(b => b.id)
        );
        const allottedQty = allotments
          .filter(a => plantBookingIds.has(a.booking_id))
          .reduce((s, a) => s + a.quantity, 0);

        const soldQty = sales
          .filter(s => s.plant_id === plant.id)
          .reduce((s, sale) => s + sale.quantity, 0);

        const freeStock = Math.max(0, totalStock - allottedQty - soldQty);

        return { plant, totalStock, allottedQty, soldQty, freeStock };
      })
      .filter(item => item.totalStock > 0);
  });

  return (
    <div className="space-y-6">
      {/* Today's Sales Hero Card */}
      <div className="bg-gradient-to-br from-green-500 to-green-700 p-8 rounded-3xl shadow-xl text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Banknote className="w-32 h-32 transform rotate-12" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center space-x-3 opacity-90 mb-3">
            <Banknote className="w-5 h-5" />
            <span className="text-sm font-bold uppercase tracking-wider">Today's Sales</span>
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
            <h3 className="text-lg font-extrabold text-gray-900">Sell</h3>
            <p className="text-xs font-medium text-gray-500 mt-1">Direct sale or deliver booked order</p>
          </div>
        </Link>

        <Link href="/bookings" className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-5 active:scale-95 transition-all">
          <div className="bg-blue-100 p-4 rounded-2xl text-blue-600 shadow-inner">
            <BookOpen className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">Manage Bookings</h3>
            <p className="text-xs font-medium text-gray-500 mt-1">View, deliver, or create bookings</p>
          </div>
        </Link>

        <Link href="/lots" className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-5 active:scale-95 transition-all">
          <div className="bg-orange-100 p-4 rounded-2xl text-orange-600 shadow-inner">
            <Layers className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">View Stock</h3>
            <p className="text-xs font-medium text-gray-500 mt-1">Check available plants in lots</p>
          </div>
        </Link>
      </div>

      {/* Free Stock by Plant Section */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2 px-1">
          <Leaf className="w-5 h-5 text-green-600" />
          <h2 className="font-black text-gray-800 text-lg">Free Stock by Plant</h2>
        </div>

        {!freeStockData && (
          <p className="text-sm text-gray-400 text-center py-4">Loading stock...</p>
        )}

        {freeStockData && freeStockData.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No plant stock available.</p>
        )}

        {freeStockData && freeStockData.map(({ plant, totalStock, allottedQty, freeStock }) => (
          <div
            key={plant.id}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between"
          >
            <div>
              <p className="font-extrabold text-gray-900 text-base">{plant.plant_name}</p>
              <p className="text-xs font-medium text-gray-400 mt-0.5">{plant.variety} · Total: {totalStock}</p>
            </div>
            <div className="flex items-center space-x-3 text-right">
              {allottedQty > 0 && (
                <div className="text-center">
                  <p className="text-xs font-bold text-red-500 uppercase tracking-wide">BOOKED</p>
                  <p className="text-lg font-black text-red-500">{allottedQty}</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-xs font-bold text-green-600 uppercase tracking-wide">FREE</p>
                <p className="text-2xl font-black text-green-600">{freeStock}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
