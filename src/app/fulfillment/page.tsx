'use client';

import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, logAudit } from '@/lib/db';
import { PackageOpen, CheckCircle, Clock } from 'lucide-react';

export default function FulfillmentPage() {
  const [userId, setUserId] = useState('');

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('snms_user') || '{}');
    setUserId(user.id);
  }, []);

  const bookings = useLiveQuery(() => db.bookings.where('assigned_to').equals(userId).toArray(), [userId]);
  const sales = useLiveQuery(() => db.direct_sales.where('assigned_to').equals(userId).toArray(), [userId]);
  const plants = useLiveQuery(() => db.plants.toArray());
  const lots = useLiveQuery(() => db.lots.toArray());
  const allotments = useLiveQuery(() => db.allotments.toArray());

  const pendingSales = sales?.filter(s => s.fulfillment_status === 'Pending Handover') || [];
  const pendingBookings = bookings?.filter(b => ['Pending', 'Allocated', 'Ready'].includes(b.status)) || [];

  const checkSoldOutLot = async (lotId: string | null | undefined, plantId: string) => {
    if (!lotId || !lots || !allotments || !bookings || !sales) return;
    const lot = lots.find(l => l.id === lotId);
    if (!lot || lot.status === 'Completed') return;

    const currentBookings = await db.bookings.toArray();
    const currentAllotments = await db.allotments.toArray();
    const currentSales = await db.direct_sales.toArray();

    const activeBookingIds = new Set(
      currentBookings.filter(b => b.plant_id === plantId && b.status !== 'Delivered' && b.status !== 'Cancelled').map(b => b.id)
    );
    const allottedQty = currentAllotments.filter(a => a.lot_id === lotId && activeBookingIds.has(a.booking_id)).reduce((s,a) => s + a.quantity, 0);
    const deliveredQty = currentBookings.filter(b => b.lot_id === lotId && b.status === 'Delivered').reduce((s,b) => s + b.quantity, 0);
    const salesQty = currentSales.filter(s => s.lot_id === lotId).reduce((s, sale) => s + sale.quantity, 0);

    const freeStock = (lot.available_stock ?? lot.total_quantity) - allottedQty - deliveredQty - salesQty;
    
    if (freeStock <= 0) {
       const updatedLot = { ...lot, status: 'Completed' as const };
       await db.lots.put(updatedLot);
       await db.sync_queue.add({ table: 'lots', action: 'UPDATE', payload: { ...updatedLot, sync_status: undefined }, created_at: Date.now() });
    }
  };

  const handleFulfillSale = async (id: string) => {
    try {
      const sale = await db.direct_sales.get(id);
      if (!sale) return;

      const updates = { fulfillment_status: 'Fulfilled' as const, sync_status: 'pending' as const };
      await db.direct_sales.update(id, updates);
      await db.sync_queue.add({
        table: 'direct_sales',
        action: 'UPDATE',
        payload: { ...sale, ...updates, sync_status: undefined },
        created_at: Date.now()
      });

      const user = JSON.parse(localStorage.getItem('snms_user') || '{}');
      await logAudit(user.id, user.name, 'FULFILL_SALE', 'direct_sales', id, { note: 'Handed over to customer' });
      await checkSoldOutLot(sale.lot_id, sale.plant_id);
      window.dispatchEvent(new Event('online'));
    } catch (e) {
      console.error(e);
      alert('Failed to fulfill sale');
    }
  };

  const handleDeliverBooking = async (id: string) => {
    try {
      const booking = await db.bookings.get(id);
      if (!booking) return;

      const updates = { status: 'Delivered' as const, sync_status: 'pending' as const };
      await db.bookings.update(id, updates);
      await db.sync_queue.add({
        table: 'bookings',
        action: 'UPDATE',
        payload: { ...booking, ...updates, sync_status: undefined },
        created_at: Date.now()
      });

      const user = JSON.parse(localStorage.getItem('snms_user') || '{}');
      await logAudit(user.id, user.name, 'DELIVER_BOOKING', 'bookings', id, { note: 'Handed over to customer' });
      await checkSoldOutLot(booking.lot_id, booking.plant_id);
      window.dispatchEvent(new Event('online'));
    } catch (e) {
      console.error(e);
      alert('Failed to deliver booking');
    }
  };

  if (!userId || !bookings || !sales || !plants) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const hasTasks = pendingSales.length > 0 || pendingBookings.length > 0;

  return (
    <div className="p-6 mb-24 space-y-6 max-w-2xl mx-auto">
      <header>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <PackageOpen className="w-8 h-8 text-blue-600" /> My Orders
        </h1>
        <p className="text-gray-500 font-medium text-sm mt-1">Orders assigned to you for handover</p>
      </header>

      {!hasTasks && (
        <div className="text-center bg-white p-10 rounded-3xl border border-gray-100 shadow-sm mt-10">
          <CheckCircle className="w-16 h-16 text-green-200 mx-auto mb-4" />
          <h2 className="text-xl font-black text-gray-800">All caught up!</h2>
          <p className="text-gray-500 font-medium text-sm mt-2">No pending orders assigned to you.</p>
        </div>
      )}

      {pendingSales.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-black text-purple-900 text-lg flex items-center gap-2">
            <span className="bg-purple-200 text-purple-800 w-6 h-6 rounded-full flex items-center justify-center text-xs">{pendingSales.length}</span>
            Direct Sales
          </h2>
          <div className="grid gap-3">
            {pendingSales.map(sale => {
              const plant = plants.find(p => p.id === sale.plant_id);
              return (
                <div key={sale.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="font-black text-gray-900">{sale.sale_number}</p>
                    <p className="text-sm font-bold text-gray-600 mt-1">{plant?.plant_name} × {sale.quantity}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{sale.customer_name || 'Walk-in'} • {sale.customer_phone || 'No phone'}</p>
                  </div>
                  <button
                    onClick={() => handleFulfillSale(sale.id)}
                    className="bg-purple-600 hover:bg-purple-700 active:scale-95 transition-all text-white font-bold py-3 px-4 rounded-xl text-sm whitespace-nowrap"
                  >
                    Hand Over
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pendingBookings.length > 0 && (
        <div className="space-y-4 mt-8">
          <h2 className="font-black text-blue-900 text-lg flex items-center gap-2">
            <span className="bg-blue-200 text-blue-800 w-6 h-6 rounded-full flex items-center justify-center text-xs">{pendingBookings.length}</span>
            Bookings
          </h2>
          <div className="grid gap-3">
            {pendingBookings.map(booking => {
              const plant = plants.find(p => p.id === booking.plant_id);
              const isReady = booking.status === 'Ready';
              return (
                <div key={booking.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-black text-gray-900">{booking.booking_number}</p>
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isReady ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {booking.status}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-gray-600 mt-1">{plant?.plant_name} × {booking.quantity}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{booking.customer_name} • {booking.customer_phone}</p>
                  </div>
                  <button
                    onClick={() => handleDeliverBooking(booking.id)}
                    disabled={!isReady}
                    className={`font-bold py-3 px-4 rounded-xl text-sm whitespace-nowrap active:scale-95 transition-all ${
                      isReady ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {isReady ? 'Deliver' : 'Waiting Stock'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
