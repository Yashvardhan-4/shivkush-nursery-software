'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { db, logAudit } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Save, AlertTriangle, CheckCircle, Clock, Archive } from 'lucide-react';

interface Props {
  params: Promise<{ id: string }>;
}

export default function EditLotPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  const [lotNumber, setLotNumber] = useState('');
  const [quantity, setQuantity] = useState('');
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

  // Populate form when lot loads
  useEffect(() => {
    if (lot === null) { setNotFound(true); return; }
    if (!lot) return;
    setLotNumber(lot.lot_number);
    setQuantity(String(lot.total_quantity));
    setReadyDate(lot.ready_date);
    setStatus(lot.status);
    setNotes(lot.notes || '');
  }, [lot]);

  const allottedQty = allotments?.reduce((sum, a) => sum + a.quantity, 0) || 0;
  const newQty = parseInt(quantity) || 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newQty < allottedQty) {
      alert(`Cannot reduce quantity below ${allottedQty} — that many plants are already allotted to bookings.`);
      return;
    }
    setLoading(true);
    try {
      const user = JSON.parse(localStorage.getItem('snms_user') || '{}');
      const lot = await db.lots.get(id);
      if (!lot) return;

      const oldTotal = lot.total_quantity;
      const diff = newQty - oldTotal;

      const updates = {
        ...lot,
        lot_number: lotNumber,
        total_quantity: newQty,
        initial_quantity: (lot.initial_quantity || oldTotal) + diff,
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
      await logAudit(user.id || 'owner', user.name || 'Owner', 'UPDATE_LOT', 'lots', id, {
        lot_number: lotNumber,
        total_quantity: newQty,
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
             'Lot Completed'}
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
        {/* Lot Number */}
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-500 uppercase tracking-wider">Lot Number</label>
          <input
            required
            type="text"
            value={lotNumber}
            onChange={e => setLotNumber(e.target.value)}
            className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold"
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
              <option value="Completed">Completed</option>
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

        {/* Quantity */}
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-500 uppercase tracking-wider">
            Total Quantity
            {allottedQty > 0 && <span className="ml-2 text-blue-600 font-semibold normal-case">(min {allottedQty} — already allotted)</span>}
          </label>
          <input
            required
            type="number"
            min={allottedQty || 1}
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold text-xl"
          />
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
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white font-black text-lg p-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-60 shadow-lg flex items-center justify-center gap-2"
        >
          <Save className="w-5 h-5" />
          {loading ? 'Saving...' : 'Update Lot'}
        </button>
      </form>
    </div>
  );
}
