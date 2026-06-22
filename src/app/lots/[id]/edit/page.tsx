'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { db, logAudit } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Save, AlertTriangle, CheckCircle, Clock, Archive, Trash2 } from 'lucide-react';

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
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const lot = useLiveQuery(() => db.lots.get(id), [id]);
  const plant = useLiveQuery(() => lot ? db.plants.get(lot.plant_id) : undefined, [lot]);
  const allotments = useLiveQuery(async () => {
    const all = await db.allotments.where('lot_id').equals(id).toArray();
    const bIds = all.map(a => a.booking_id);
    if (bIds.length === 0) return [];
    const bookings = await db.bookings.where('id').anyOf(bIds).toArray();
    const activeBookingIds = new Set(
      bookings.filter(b => b.status !== 'Delivered' && b.status !== 'Cancelled').map(b => b.id)
    );
    return all.filter(a => activeBookingIds.has(a.booking_id));
  }, [id]);

  const sales = useLiveQuery(() => db.direct_sales.where('lot_id').equals(id).toArray(), [id]);
  const deliveredBookings = useLiveQuery(() => db.bookings.where('lot_id').equals(id).filter(b => b.status === 'Delivered').toArray(), [id]);

  // Populate form when lot loads
  useEffect(() => {
    if (lot === null) { setNotFound(true); return; }
    if (!lot) return;
    setLotNumber(lot.lot_number);
    setLotName(lot.lot_name || '');
    setAvailableStock(String(lot.available_stock ?? lot.total_quantity));
    setReadyDate(lot.ready_date);
    setStatus(lot.status);
    setNotes(lot.notes || '');
  }, [lot]);

  const allottedQty = allotments?.reduce((sum, a) => sum + a.quantity, 0) || 0;
  const soldQty = sales?.reduce((sum, s) => sum + s.quantity, 0) || 0;
  const deliveredQty = deliveredBookings?.reduce((sum, b) => sum + b.quantity, 0) || 0;
  const usedQty = allottedQty + soldQty + deliveredQty;
  const newQty = parseInt(availableStock) || 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newQty < usedQty) {
      alert(`Cannot reduce available stock below ${usedQty} — ${allottedQty} allotted, ${soldQty} sold directly, ${deliveredQty} delivered.`);
      return;
    }
    setLoading(true);
    try {
      const user = JSON.parse(localStorage.getItem('snms_user') || '{}');
      const lot = await db.lots.get(id);
      if (!lot) return;

      const updates = {
        ...lot,
        lot_number: lotNumber,
        lot_name: lotName || undefined,
        available_stock: newQty,
        ready_date: readyDate,
        status,
        notes,
      };
      await db.lots.put(updates);
      await db.sync_queue.add({
        table: 'lots',
        action: 'UPDATE',
        payload: { ...updates, sync_status: undefined },
        created_at: Date.now(),
      });
      await logAudit(user.id || '00000000-0000-0000-0000-000000000000', user.name || 'Owner', 'UPDATE_LOT', 'lots', id, {
        lot_number: lotNumber,
        lot_name: lotName,
        available_stock: newQty,
        ready_date: readyDate,
        status,
        notes,
      });
      window.dispatchEvent(new Event('online'));
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
      setLoading(true);
      try {
        const user = JSON.parse(localStorage.getItem('snms_user') || '{}');
        await db.lots.delete(id);
        await db.sync_queue.add({
          table: 'lots',
          action: 'DELETE',
          payload: { id },
          created_at: Date.now(),
        });
        await logAudit(user.id || '00000000-0000-0000-0000-000000000000', user.name || 'Owner', 'DELETE_LOT', 'lots', id, { lot_number: lotNumber });
        window.dispatchEvent(new Event('online'));
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
            {allottedQty} plants allotted to bookings · {newQty - allottedQty} free
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
          <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
          {usedQty === 0 ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="px-4 py-4 rounded-xl text-red-600 bg-red-50 hover:bg-red-100 font-black flex items-center gap-2 transition-colors"
            >
              <Trash2 className="w-5 h-5" />
              Delete Lot
            </button>
          ) : (
            <div className="text-xs text-gray-400 font-medium max-w-[200px]">
              Lot cannot be deleted because it has active orders or sales.
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex-1 ml-4 bg-green-600 hover:bg-green-700 text-white font-black py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm shadow-green-200"
          >
            <Save className="w-5 h-5" />
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
        </div>
      </form>
    </div>
  );
}
