'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useState } from 'react';
import { Pencil, AlertTriangle, Check, Trash2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function LotList() {
  const { t } = useLanguage();
  const [statusFilter, setStatusFilter] = useState<'Growing' | 'Ready' | 'Completed'>('Growing');

  const lots = useLiveQuery(() => db.lots.toArray());
  const plants = useLiveQuery(() => db.plants.toArray());
  const allotments = useLiveQuery(() => db.allotments.toArray());
  const bookings = useLiveQuery(() => db.bookings.toArray());
  const directSales = useLiveQuery(() => db.direct_sales.toArray());

  const handleMarkReady = async (lotId: string) => {
    try {
      const lot = await db.lots.get(lotId);
      if (!lot) return;
      
      const updates = {
        status: 'Ready' as const,
        updated_at: new Date().toISOString()
      };
      
      await db.lots.update(lotId, updates);
      await db.sync_queue.add({
        table: 'lots',
        action: 'UPDATE',
        payload: { ...lot, ...updates, sync_status: undefined },
        created_at: Date.now(),
      });

      // Also mark all 'Allocated' bookings for this lot as 'Ready'
      const allocatedBookings = await db.bookings.where('lot_id').equals(lotId).toArray();
      for (const b of allocatedBookings) {
        if (b.status === 'Allocated') {
          await db.bookings.update(b.id, { status: 'Ready', sync_status: 'pending' });
          await db.sync_queue.add({
            table: 'bookings',
            action: 'UPDATE',
            payload: { ...b, status: 'Ready', sync_status: undefined },
            created_at: Date.now(),
          });
        }
      }

      window.dispatchEvent(new Event('online'));
    } catch (error) {
      console.error('Failed to mark lot as ready:', error);
      alert('Failed to update lot status');
    }
  };

  const handleDeleteLot = async (lotId: string) => {
    if (confirm('Are you sure you want to completely delete this empty lot? This action cannot be undone.')) {
      try {
        const user = JSON.parse(localStorage.getItem('snms_user') || '{}');
        await db.lots.delete(lotId);
        await db.sync_queue.add({
          table: 'lots',
          action: 'DELETE',
          payload: { id: lotId },
          created_at: Date.now(),
        });
        window.dispatchEvent(new Event('online'));
      } catch (error) {
        console.error('Failed to delete lot:', error);
        alert('Failed to delete lot');
      }
    }
  };

  if (!lots || !plants || !allotments || !bookings || !directSales) {
    return <div className="p-4 text-center text-gray-500 font-medium">{t('loadingLots')}</div>;
  }

  const baseFiltered = lots.filter(l => l.status === statusFilter);
  const filtered = [...baseFiltered].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  const activeBookingIds = new Set(
    bookings.filter(b => b.status !== 'Delivered' && b.status !== 'Cancelled').map(b => b.id)
  );



  return (
    <div className="space-y-4">
      {/* Status Filter Tabs & Hint */}
      <div className="flex flex-col gap-2 mb-2">
        <div className="flex space-x-2 overflow-x-auto pb-1">
          {(['Growing', 'Ready', 'Completed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
                statusFilter === s
                  ? s === 'Ready' ? 'bg-green-600 text-white' : s === 'Growing' ? 'bg-yellow-500 text-white' : 'bg-gray-600 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {t(s.toLowerCase() as any)}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 italic px-1">
          {t('lotFilterHint')}
        </p>
      </div>

      <div className="grid gap-4">
        {filtered.map(lot => {
          const plant = plants.find(p => p.id === lot.plant_id);
          const plantName = plant ? plant.plant_name : 'Unknown Plant';

          // Allotted to bookings for this specific lot
          const allottedQty = allotments
            .filter(a => a.lot_id === lot.id && activeBookingIds.has(a.booking_id))
            .reduce((sum, a) => sum + a.quantity, 0);

          // Delivered booking quantities for this lot
          const deliveredQty = bookings
            .filter(b => b.lot_id === lot.id && b.status === 'Delivered')
            .reduce((sum, b) => sum + b.quantity, 0);

          // Direct sales for this lot
          const directSoldQty = directSales
            .filter(s => s.lot_id === lot.id)
            .reduce((sum, s) => sum + s.quantity, 0);

          const soldQty = deliveredQty + directSoldQty;
          
          const availableStock = lot.available_stock ?? lot.initial_quantity ?? lot.total_quantity;
          const freeStock = Math.max(0, availableStock - allottedQty - soldQty);
          
          const readyDate = new Date(lot.ready_date);
          const today = new Date();
          const daysUntilReady = Math.ceil((readyDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
          const isReady = daysUntilReady <= 0;

          const statusColors: Record<string, string> = {
            Growing: 'bg-yellow-100 text-yellow-700',
            Ready: 'bg-green-100 text-green-700',
            Completed: 'bg-gray-100 text-gray-600',
          };

          return (
            <div key={lot.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-1.5 h-full ${isReady ? 'bg-green-500' : lot.status === 'Completed' ? 'bg-gray-400' : 'bg-yellow-400'}`}></div>
              
              <div className="pl-2">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-black text-gray-900 text-lg">{lot.lot_number}</h3>
                    <p className="text-sm font-bold text-gray-500">{plantName} · {plant?.variety}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-black ${statusColors[lot.status] || 'bg-gray-100 text-gray-600'}`}>
                      {isReady && lot.status === 'Growing'
                        ? t('overdueBadge')
                        : lot.status === 'Growing'
                          ? t('inDays').replace('{days}', String(daysUntilReady))
                          : t(lot.status.toLowerCase() as any).toUpperCase()}
                    </span>
                    <a
                      href={`/lots/${lot.id}/edit`}
                      className="p-2 bg-gray-100 rounded-xl text-gray-500 active:scale-95 transition-all"
                    >
                      <Pencil className="w-4 h-4" />
                    </a>
                    {allottedQty === 0 && soldQty === 0 && (
                      <button
                        onClick={() => handleDeleteLot(lot.id)}
                        className="p-2 bg-red-50 rounded-xl text-red-500 active:scale-95 transition-all hover:bg-red-100"
                        title="Delete empty lot"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Overdue nudge */}
                {isReady && lot.status === 'Growing' && (
                  <div className="flex flex-col gap-2 bg-orange-50 border border-orange-200 rounded-xl p-3 mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-orange-700">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {t('readyDatePassed')}
                    </div>
                    <button
                      onClick={() => handleMarkReady(lot.id)}
                      className="bg-orange-600 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1 active:scale-95 transition-transform"
                    >
                      <Check className="w-3.5 h-3.5" /> {t('markAsReady')}
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-5 gap-1 bg-gray-50 p-3 rounded-xl">
                  <div className="text-center">
                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{t('total')}</p>
                    <p className="font-black text-gray-700 text-lg">
                      {lot.initial_quantity ?? Math.max(lot.total_quantity, allottedQty + soldQty)}
                    </p>
                  </div>
                  <div className="text-center border-l border-gray-200">
                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Available</p>
                    <p className="font-black text-gray-900 text-lg">{availableStock}</p>
                  </div>
                  <div className="text-center border-l border-gray-200">
                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{t('allotted')}</p>
                    <p className="font-black text-blue-600 text-lg">{allottedQty}</p>
                  </div>
                  <div className="text-center border-l border-gray-200">
                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{t('sold')}</p>
                    <p className="font-black text-orange-500 text-lg">{soldQty}</p>
                  </div>
                  <div className="text-center border-l border-gray-200">
                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{t('free')}</p>
                    <p className={`font-black text-lg ${freeStock > 0 ? 'text-green-600' : 'text-red-500'}`}>{freeStock}</p>
                  </div>
                </div>

                {lot.notes && (
                  <p className="text-xs text-gray-500 italic mt-3 bg-gray-50 p-2 rounded-lg border border-gray-100">
                    {lot.notes}
                  </p>
                )}
                <p className="text-xs text-gray-400 font-semibold mt-3">
                  {t('readyDate')}: {readyDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center p-12 bg-white rounded-2xl border border-gray-100 border-dashed">
            <p className="text-gray-500 font-medium">{t('noLotsFoundStatus').replace('{status}', t(statusFilter.toLowerCase() as any))}</p>
          </div>
        )}
      </div>
    </div>
  );
}
