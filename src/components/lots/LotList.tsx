'use client';

import { supabase } from '@/lib/supabaseClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pencil, AlertTriangle, Check, Trash2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function LotList() {
  const { t } = useLanguage();
  const [statusFilter, setStatusFilter] = useState<'Ready' | 'Growing' | 'Sold Out'>('Ready');

  const queryClient = useQueryClient();
  const { data: queriesData } = useQuery({
    queryKey: ['lot-list-data'],
    queryFn: async () => {
      const [lotsRes, plantsRes, allotmentsRes, bookingsRes, directSalesRes, inventoryRes] = await Promise.all([
        supabase.from('lots').select('*').is('deleted_at', null),
        supabase.from('plants').select('*').is('deleted_at', null),
        supabase.from('allotments').select('*').is('deleted_at', null),
        supabase.from('bookings').select('*').is('deleted_at', null),
        supabase.from('direct_sales').select('*').is('deleted_at', null),
        supabase.from('vw_inventory_status').select('*')
      ]);
      return {
        lots: lotsRes.data || [],
        plants: plantsRes.data || [],
        allotments: allotmentsRes.data || [],
        bookings: bookingsRes.data || [],
        directSales: directSalesRes.data || [],
        inventory: inventoryRes.data || []
      };
    }
  });

  const { lots, plants, allotments, bookings, directSales, inventory } = queriesData || {};

  const handleMarkReady = async (lotId: string) => {
    try {
      if (!navigator.onLine) { alert('You must be online to save.'); return; }
      const lot = lots?.find(l => l.id === lotId);
      if (!lot) return;
      
      const updates = {
        status: 'Ready' as const,
        updated_at: new Date().toISOString()
      };
      
      await supabase.from('lots').update(updates).eq('id', lotId);

      const lotAllotments = allotments?.filter(a => a.lot_id === lotId) || [];
      const bookingIds = new Set(lotAllotments.map(a => a.booking_id));
      const allocatedBookings = (bookings || []).filter(b => bookingIds.has(b.id));
      
      for (const b of allocatedBookings) {
        if (b.status === 'Allocated') {
          await supabase.from('bookings').update({ status: 'Ready' }).eq('id', b.id);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['lot-list-data'] });
      queryClient.invalidateQueries({ queryKey: ['vw_inventory_status'] });
    } catch (error) {
      console.error('Failed to mark lot as ready:', error);
      alert('Failed to update lot status');
    }
  };

  const handleDeleteLot = async (lotId: string) => {
    if (confirm('Are you sure you want to completely delete this empty lot? This action cannot be undone.')) {
      try {
        if (!navigator.onLine) { alert('You must be online to save.'); return; }
        const deletedAt = new Date().toISOString();
        await supabase.from('lots').update({ deleted_at: deletedAt }).eq('id', lotId);
        queryClient.invalidateQueries({ queryKey: ['lot-list-data'] });
        queryClient.invalidateQueries({ queryKey: ['vw_inventory_status'] });
      } catch (error) {
        console.error('Failed to delete lot:', error);
        alert('Failed to delete lot');
      }
    }
  };

  if (!lots || !plants || !allotments || !bookings || !directSales) {
    return <div className="p-4 text-center text-gray-500 font-medium">{t('loadingLots')}</div>;
  }

  // Determine authoritative lot status using physical stock
  const getLotEffectiveStatus = (lot: any): 'Growing' | 'Ready' | 'Sold Out' => {
    const inv = inventory?.find((i: any) => i.lot_id === lot.id);
    if (lot.status === 'Completed' || lot.status === 'Sold Out') return 'Sold Out';
    if (inv && inv.current_physical_stock <= 0 && (inv.survived_quantity > 0 || inv.sold_quantity > 0)) {
      return 'Sold Out';
    }
    if (lot.status === 'Growing') return 'Growing';
    return 'Ready';
  };

  const filtered = lots
    .filter(l => getLotEffectiveStatus(l) === statusFilter)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  return (
    <div className="space-y-4">
      {/* Status Filter Tabs */}
      <div className="flex flex-col gap-2 mb-2">
        <div className="flex space-x-2 overflow-x-auto pb-1">
          {(['Ready', 'Growing', 'Sold Out'] as const).map(s => {
            const count = lots.filter(l => getLotEffectiveStatus(l) === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  statusFilter === s
                    ? s === 'Ready'
                      ? 'bg-green-600 text-white shadow-sm'
                      : s === 'Growing'
                      ? 'bg-yellow-500 text-white shadow-sm'
                      : 'bg-gray-800 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>{s === 'Sold Out' ? 'Sold Out' : t(s.toLowerCase() as any)}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  statusFilter === s ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-400 italic px-1">
          {statusFilter === 'Sold Out' 
            ? 'Batches with 0 remaining physical stock' 
            : statusFilter === 'Ready' 
            ? 'Batches ready for sale or allocation' 
            : 'Batches currently in growth phase'}
        </p>
      </div>

      <div className="grid gap-4">
        {filtered.map(lot => {
          const plant = plants.find(p => p.id === lot.plant_id);
          const effectiveStatus = getLotEffectiveStatus(lot);

          const inv = inventory?.find((i: any) => i.lot_id === lot.id) || {
            allocated_quantity: 0,
            sold_quantity: 0,
            free_stock: 0,
            survived_quantity: lot.total_quantity
          };

          const allottedQty = inv.allocated_quantity;
          const soldQty = inv.sold_quantity;
          const availableStock = inv.survived_quantity;
          const freeStock = inv.free_stock;
          
          const readyDate = new Date(lot.ready_date);
          const today = new Date();
          const daysUntilReady = Math.ceil((readyDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
          const isDatePassed = daysUntilReady <= 0;

          const statusBadge = effectiveStatus === 'Sold Out'
            ? 'bg-gray-100 text-gray-700 border border-gray-200'
            : effectiveStatus === 'Ready'
            ? 'bg-green-100 text-green-800 border border-green-200'
            : 'bg-yellow-100 text-yellow-800 border border-yellow-200';

          return (
            <div key={lot.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-1.5 h-full ${
                effectiveStatus === 'Sold Out' ? 'bg-gray-400' : effectiveStatus === 'Ready' ? 'bg-green-500' : 'bg-yellow-400'
              }`}></div>
              
              <div className="pl-2">
                <div className="flex justify-between items-start mb-4">
                  <div className="min-w-0 flex-1 pr-2">
                    <h3 className="font-black text-gray-900 text-lg truncate">{lot.lot_name || lot.lot_number}</h3>
                    <p className="text-sm font-bold text-gray-500 mt-0.5 truncate">{plant?.plant_name} · {plant?.variety}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {lot.lot_name && <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-1 rounded-md hidden sm:inline-block">{lot.lot_number}</span>}
                    <span className={`px-3 py-1 rounded-full text-xs font-black ${statusBadge}`}>
                      {effectiveStatus === 'Sold Out'
                        ? 'SOLD OUT'
                        : effectiveStatus === 'Growing' && isDatePassed
                        ? t('overdueBadge')
                        : effectiveStatus === 'Growing'
                        ? t('inDays').replace('{days}', String(daysUntilReady))
                        : 'READY'}
                    </span>
                    <a
                      href={`/lots/${lot.id}/edit`}
                      className="p-2 bg-gray-100 rounded-xl text-gray-500 hover:bg-gray-200 active:scale-95 transition-all"
                    >
                      <Pencil className="w-4 h-4" />
                    </a>
                    {allottedQty === 0 && soldQty === 0 && (
                      <button
                        onClick={() => handleDeleteLot(lot.id)}
                        className="p-2 bg-red-50 rounded-xl text-red-500 hover:bg-red-100 active:scale-95 transition-all"
                        title="Delete empty lot"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Overdue nudge for growing batches */}
                {effectiveStatus === 'Growing' && isDatePassed && (
                  <div className="flex flex-col gap-2 bg-orange-50 border border-orange-200 rounded-xl p-3 mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-orange-700">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {t('readyDatePassed')}
                    </div>
                    <button
                      onClick={() => handleMarkReady(lot.id)}
                      className="bg-orange-600 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1 active:scale-95 transition-transform shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5" /> {t('markAsReady')}
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-gray-50 p-3 rounded-xl">
                  <div className="text-center bg-white p-2 rounded-lg border border-gray-100 col-span-2 sm:col-span-1">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t('total')}</p>
                    <p className="font-black text-gray-700 text-xl">
                      {lot.initial_quantity ?? lot.total_quantity}
                    </p>
                  </div>
                  <div className="text-center bg-white p-2 rounded-lg border border-gray-100">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Survived</p>
                    <p className="font-black text-gray-900 text-lg">{availableStock}</p>
                  </div>
                  <div className="text-center bg-white p-2 rounded-lg border border-gray-100">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t('allotted')}</p>
                    <p className="font-black text-blue-600 text-lg">{allottedQty}</p>
                  </div>
                  <div className="text-center bg-white p-2 rounded-lg border border-gray-100">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t('sold')}</p>
                    <p className="font-black text-orange-500 text-lg">{soldQty}</p>
                  </div>
                  <div className="text-center bg-white p-2 rounded-lg border border-gray-100">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t('free')}</p>
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
            <p className="text-gray-500 font-medium">
              No {statusFilter.toLowerCase()} lots found.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
