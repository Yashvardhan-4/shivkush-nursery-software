'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, AlertTriangle, CheckCircle, Clock, Archive, Trash2, Layers } from 'lucide-react';

interface Props {
  params: Promise<{ id: string }>;
}

export default function EditLotPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  const [lotNumber, setLotNumber] = useState('');
  const [lotName, setLotName] = useState('');
  const [availableStock, setAvailableStock] = useState('');
  const [readyDate, setReadyDate] = useState('');
  const [status, setStatus] = useState<'Growing' | 'Ready' | 'Completed'>('Growing');
  const [notes, setNotes] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [targetLotId, setTargetLotId] = useState('');

  const queryClient = useQueryClient();
  const { data: queriesData, isLoading: isQueriesLoading } = useQuery({
    queryKey: ['lot-details', id],
    queryFn: async () => {
      const { data: lotData, error: lotErr } = await supabase.from('lots').select('*').eq('id', id).single();
      if (lotErr || !lotData) return { lot: null };
      
      const { data: plantData } = await supabase.from('plants').select('*').eq('id', lotData.plant_id).single();
      
      const { data: otherLotsData } = await supabase.from('lots')
         .select('*')
         .eq('plant_id', lotData.plant_id)
         .neq('id', id)
         .neq('status', 'Completed')
         .is('deleted_at', null);

      const { data: allotmentsData } = await supabase.from('allotments').select('*').eq('lot_id', id).is('deleted_at', null);
      let validAllotments: any[] = [];
      if (allotmentsData && allotmentsData.length > 0) {
         const bIds = allotmentsData.map((a: any) => a.booking_id);
         const { data: bData } = await supabase.from('bookings').select('id, status').in('id', bIds).is('deleted_at', null);
         const activeBookingIds = new Set(
            (bData || []).filter((b: any) => b.status !== 'Delivered' && b.status !== 'Cancelled').map((b: any) => b.id)
         );
         validAllotments = allotmentsData.filter((a: any) => activeBookingIds.has(a.booking_id));
      }

      const { data: salesData } = await supabase.from('direct_sales').select('*').eq('lot_id', id).is('deleted_at', null);
      const { data: deliveredBookingsData } = await supabase.from('bookings').select('*').eq('lot_id', id).eq('status', 'Delivered').is('deleted_at', null);

      return {
        lot: lotData,
        plant: plantData,
        otherLots: otherLotsData || [],
        allotments: validAllotments,
        sales: salesData || [],
        deliveredBookings: deliveredBookingsData || []
      };
    }
  });

  const { lot, plant, otherLots, allotments, sales, deliveredBookings } = queriesData || {};

  // Populate form when lot loads
  useEffect(() => {
    if (queriesData && !queriesData.lot) { setNotFound(true); return; }
    if (!lot) return;
    setLotNumber(lot.lot_number);
    setLotName(lot.lot_name || '');
    setAvailableStock(String(lot.total_quantity));
    setReadyDate(lot.ready_date);
    setStatus(lot.status);
    setNotes(lot.notes || '');
  }, [lot, queriesData]);

  const allottedQty = allotments?.reduce((sum, a) => sum + a.quantity, 0) || 0;
  const soldQty = sales?.reduce((sum, s) => sum + s.quantity, 0) || 0;
  const deliveredQty = deliveredBookings?.reduce((sum, b) => sum + b.quantity, 0) || 0;
  const usedQty = allottedQty + soldQty + deliveredQty;
  const newQty = parseInt(availableStock) || 0;

  const handleMergeLot = async () => {
    if (!targetLotId) return alert('Select a target lot');
    const targetLot = otherLots?.find(l => l.id === targetLotId);
    if (!targetLot) return;

    const freeQty = newQty - usedQty;
    if (freeQty <= 0) {
      alert('This lot has no free stock to merge.');
      return;
    }

    if (!confirm(`Are you sure you want to transfer ${freeQty} free saplings from this lot into "${targetLot.lot_name || targetLot.lot_number}"? This cannot be undone.`)) return;

    if (!navigator.onLine) { alert('You must be online to save.'); return; }
    setLoading(true);
    try {
      const user = JSON.parse(localStorage.getItem('snms_user') || '{}');
      
      const targetUpdates = {
        total_quantity: targetLot.total_quantity + freeQty,
        available_stock: (targetLot.available_stock ?? targetLot.total_quantity) + freeQty,
        notes: `${targetLot.notes || ''}\n[Merge] Received ${freeQty} saplings from lot ${lotNumber}`.trim()
      };
      await supabase.from('lots').update(targetUpdates).eq('id', targetLot.id);

      const sourceUpdates = {
        total_quantity: lot!.total_quantity - freeQty,
        available_stock: lot!.total_quantity - freeQty - usedQty,
        status: usedQty === 0 ? 'Completed' : status,
        notes: `${notes || ''}\n[Merge] Transferred ${freeQty} free saplings to lot ${targetLot.lot_name || targetLot.lot_number}`.trim()
      };
      await supabase.from('lots').update(sourceUpdates).eq('id', id);

      await supabase.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id || '00000000-0000-0000-0000-000000000000',
        user_name: user.name || 'Owner',
        action: 'MERGE_LOT',
        entity_type: 'lots',
        entity_id: id,
        details: { source_lot: lotNumber, target_lot: targetLot.lot_number, quantity: freeQty }
      });

      queryClient.invalidateQueries({ queryKey: ['lot-details'] });
      queryClient.invalidateQueries({ queryKey: ['lots'] });
      alert('Lots merged successfully!');
      router.push('/lots');
    } catch (e) {
      console.error(e);
      alert('Failed to merge lots');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newQty < usedQty) {
      alert(`Cannot reduce available stock below ${usedQty} — ${allottedQty} allotted, ${soldQty} sold directly, ${deliveredQty} delivered.`);
      return;
    }
    if (status === 'Completed' && allottedQty > 0) {
      alert(`Cannot mark this lot as Completed because it has ${allottedQty} active allotments. Please fulfill or release these allotments first.`);
      return;
    }
    if (!navigator.onLine) { alert('You must be online to save.'); return; }
    setLoading(true);
    try {
      const user = JSON.parse(localStorage.getItem('snms_user') || '{}');
      if (!lot) return;

      const isStockAdjusted = lot.total_quantity !== newQty;
      const finalNotes = isStockAdjusted && adjustmentReason
        ? `${notes || ''}\n[Adjustment] Stock changed from ${lot.total_quantity} to ${newQty} because: ${adjustmentReason}`.trim()
        : notes;

      const updates = {
        lot_number: lotNumber,
        lot_name: lotName || null,
        total_quantity: newQty,
        available_stock: newQty - usedQty,
        ready_date: readyDate,
        status,
        notes: finalNotes,
      };
      
      await supabase.from('lots').update(updates).eq('id', id);
      
      await supabase.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id || '00000000-0000-0000-0000-000000000000',
        user_name: user.name || 'Owner',
        action: 'UPDATE_LOT',
        entity_type: 'lots',
        entity_id: id,
        details: {
          lot_number: lotNumber,
          lot_name: lotName,
          total_quantity: newQty,
          available_stock: newQty - usedQty,
          ready_date: readyDate,
          status,
          notes: finalNotes,
          adjustment_reason: isStockAdjusted ? adjustmentReason : undefined
        }
      });
      
      queryClient.invalidateQueries({ queryKey: ['lot-details'] });
      queryClient.invalidateQueries({ queryKey: ['lots'] });
      router.push('/lots');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (usedQty > 0) {
      alert(`Cannot delete this lot. It has ${usedQty} plants already committed or sold.`);
      return;
    }
    
    if (confirm('Are you sure you want to completely delete this lot? This action cannot be undone.')) {
      if (!navigator.onLine) { alert('You must be online to save.'); return; }
      setLoading(true);
      try {
        const user = JSON.parse(localStorage.getItem('snms_user') || '{}');
        const deletedAt = new Date().toISOString();
        
        await supabase.from('lots').update({ deleted_at: deletedAt }).eq('id', id);
        
        await supabase.from('audit_logs').insert({
          id: crypto.randomUUID(),
          user_id: user.id || '00000000-0000-0000-0000-000000000000',
          user_name: user.name || 'Owner',
          action: 'DELETE_LOT',
          entity_type: 'lots',
          entity_id: id,
          details: { lot_number: lotNumber }
        });
        
        queryClient.invalidateQueries({ queryKey: ['lots'] });
        router.push('/lots');
      } finally {
        setLoading(false);
      }
    }
  };

  if (notFound) return (
    <div className="p-6 text-center py-20">
      <p className="text-2xl mb-2">🌿</p>
      <h2 className="text-xl font-black text-gray-800">Lot not found</h2>
      <button onClick={() => router.back()} className="mt-4 text-sm font-bold text-green-600 underline">Go Back</button>
    </div>
  );

  if (!lot || !plant) return (
    <div className="p-6 flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" />
    </div>
  );

  const daysUntilReady = readyDate
    ? Math.ceil((new Date(readyDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24))
    : null;

  return (
    <div className="p-6 mb-24 space-y-6">
      <header className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-xl bg-gray-100 active:scale-95 transition-transform">
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-gray-900">Update Lot</h1>
          <p className="text-sm font-bold text-gray-500">{plant.plant_name} · {plant.variety}</p>
        </div>
      </header>

      {/* Live status indicator */}
      <div className={`rounded-2xl p-4 border flex items-center gap-3 ${
        status === 'Ready' ? 'bg-green-50 border-green-200' :
        status === 'Growing' ? 'bg-yellow-50 border-yellow-200' :
        'bg-gray-50 border-gray-200'
      }`}>
        {status === 'Ready' ? <CheckCircle className="w-5 h-5 text-green-600 shrink-0" /> :
         status === 'Growing' ? <Clock className="w-5 h-5 text-yellow-600 shrink-0" /> :
         <Archive className="w-5 h-5 text-gray-400 shrink-0" />}
        <div>
          <p className={`font-black text-sm ${status === 'Ready' ? 'text-green-800' : status === 'Growing' ? 'text-yellow-800' : 'text-gray-600'}`}>
            {status === 'Ready' ? 'Lot is Ready for delivery' :
             status === 'Growing' ? daysUntilReady !== null ? daysUntilReady > 0 ? `Growing — Ready in ${daysUntilReady} days` : 'Overdue — mark as Ready?' : 'Currently Growing' :
             'Lot Sold Out'}
          </p>
          <p className="text-xs font-semibold text-gray-500 mt-0.5">
            {allottedQty} plants allotted to bookings · {newQty - usedQty} free
          </p>
        </div>
      </div>

      {/* Warning if lot is overdue */}
      {status === 'Growing' && daysUntilReady !== null && daysUntilReady <= 0 && (
        <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-2xl p-4">
          <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-orange-800 text-sm">Ready date has passed!</p>
            <p className="text-xs font-medium text-orange-600 mt-0.5">
              Update the ready date if plants need more time, or mark the status as Ready if they are done.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-500 uppercase tracking-wider">System Lot ID</label>
          <input
            readOnly
            type="text"
            value={lotNumber}
            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-gray-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-black text-gray-500 uppercase tracking-wider">Lot Name (Optional)</label>
          <input
            type="text"
            value={lotName}
            onChange={e => setLotName(e.target.value)}
            className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold"
            placeholder="e.g. Summer Batch"
          />
        </div>

        {/* Status — most important, at top for quick update */}
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-500 uppercase tracking-wider">Status</label>
          <div className="relative">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'Growing' | 'Ready' | 'Completed')}
              className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold appearance-none text-gray-800"
            >
              <option value="Growing">Growing</option>
              <option value="Ready">Ready</option>
              <option value="Completed">Sold Out</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </div>

        {/* Ready Date — dynamic! */}
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-500 uppercase tracking-wider">
            Expected Ready Date
            <span className="ml-2 text-green-600 font-semibold normal-case">(update if plants grow faster/slower)</span>
          </label>
          <input
            required
            type="date"
            value={readyDate}
            onChange={e => setReadyDate(e.target.value)}
            className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold"
          />
          {readyDate && daysUntilReady !== null && (
            <p className={`text-xs font-bold px-3 py-1.5 rounded-lg inline-block ${
              daysUntilReady > 0 ? 'bg-blue-50 text-blue-700' :
              daysUntilReady === 0 ? 'bg-green-50 text-green-700' :
              'bg-orange-50 text-orange-700'
            }`}>
              {daysUntilReady > 0 ? `📅 ${daysUntilReady} days from today` :
               daysUntilReady === 0 ? '✅ Ready today!' :
               `⚠️ ${Math.abs(daysUntilReady)} days overdue`}
            </p>
          )}
        </div>

        {/* Available Stock */}
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-500 uppercase tracking-wider">
            Total Surviving Saplings
            {usedQty > 0 && <span className="ml-2 text-blue-600 font-semibold normal-case">(min {usedQty} — already committed)</span>}
          </label>
          <input
            required
            type="number"
            min={usedQty}
            value={availableStock}
            onChange={e => setAvailableStock(e.target.value)}
            className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-xl"
          />
          <p className="text-xs font-semibold text-gray-500">
            Initial: {lot.initial_quantity ?? lot.total_quantity} • Used: {usedQty}
          </p>
        </div>

        {/* Adjustment Reason */}
        {lot && newQty !== lot.total_quantity && (
          <div className="space-y-2 animate-in slide-in-from-top-4 duration-200">
            <label className="text-xs font-black text-red-700 uppercase tracking-wider flex items-center gap-1">
              ⚠️ Reason for stock adjustment *
            </label>
            <input
              required
              type="text"
              value={adjustmentReason}
              onChange={e => setAdjustmentReason(e.target.value)}
              className="w-full p-4 bg-red-50/50 border border-red-200 rounded-xl outline-none focus:ring-2 focus:ring-red-500 font-bold text-red-900"
              placeholder="e.g. sapling deaths due to rain, recounting adjustment"
            />
          </div>
        )}

        {/* Notes */}
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-500 uppercase tracking-wider">Notes / Observations</label>
          <textarea
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Plants are growing well, some pest issues detected..."
            className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-medium resize-none"
          />
          <div className="pt-6 border-t border-gray-100 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              {usedQty === 0 ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loading}
                  className="px-4 py-4 rounded-xl text-red-600 bg-red-50 hover:bg-red-100 font-black flex items-center gap-2 transition-colors text-sm"
                >
                  <Trash2 className="w-5 h-5" />
                  Delete Lot
                </button>
              ) : (
                <div className="text-xs text-gray-400 font-medium max-w-[200px]">
                  Lot cannot be deleted because it has active commitments.
                </div>
              )}

              {newQty - usedQty > 0 && otherLots && otherLots.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMergeModal(true);
                    setTargetLotId(otherLots[0]?.id || '');
                  }}
                  disabled={loading}
                  className="px-4 py-4 rounded-xl text-amber-700 bg-amber-50 hover:bg-amber-100 font-black flex items-center gap-2 transition-colors text-sm"
                >
                  <Layers className="w-5 h-5" />
                  Merge Stock
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm shadow-green-200"
            >
              <Save className="w-5 h-5" />
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>

      {/* Merge Stock Modal */}
      {showMergeModal && otherLots && otherLots.length > 0 && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm border border-gray-100 shadow-2xl space-y-4">
            <div>
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-600" /> Merge Stock
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Transfer all free stock ({newQty - usedQty} plants) of {plant?.plant_name} from this lot into another lot.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-wider">Select Target Lot</label>
              <select
                value={targetLotId}
                onChange={e => setTargetLotId(e.target.value)}
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 font-bold text-gray-800 text-sm"
              >
                {otherLots.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.lot_name || l.lot_number} ({l.available_stock ?? l.total_quantity} stock)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowMergeModal(false)}
                className="py-3 bg-gray-100 hover:bg-gray-200 text-gray-500 font-bold rounded-xl active:scale-95 transition-transform"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMergeLot}
                disabled={loading}
                className="py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl active:scale-95 transition-transform shadow-lg shadow-amber-250"
              >
                Confirm Merge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
