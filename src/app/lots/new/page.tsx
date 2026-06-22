'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db, generateId } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';

export default function NewLotPage() {
  const [lotNumber, setLotNumber] = useState('LOT-...');
  const [lotName, setLotName] = useState('');
  
  useEffect(() => {
    async function initLotNumber() {
      const datePrefix = new Date().toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
      const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
      setLotNumber(`LOT-${datePrefix}-${randomSuffix}`);
    }
    initLotNumber();
  }, []);

  const [plantId, setPlantId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [readyDate, setReadyDate] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const plants = useLiveQuery(() => db.plants.toArray());

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plantId) return alert('Select a plant');
    setLoading(true);

    const newLot = {
      id: generateId(),
      lot_number: lotNumber,
      lot_name: lotName || undefined,
      plant_id: plantId,
      total_quantity: parseInt(quantity),
      initial_quantity: parseInt(quantity),
      available_stock: parseInt(quantity),
      ready_date: readyDate,
      status: 'Growing' as const,
      notes: ''
    };

    try {
      await db.transaction('rw', [db.lots, db.sync_queue], async () => {
        await db.lots.add(newLot);
        await db.sync_queue.add({
          table: 'lots',
          action: 'INSERT',
          payload: newLot,
          created_at: Date.now()
        });
      });
      window.dispatchEvent(new Event('online'));
      router.push('/lots');
    } catch (error) {
      console.error('Failed to save lot:', error);
      alert('Failed to save lot. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="p-6 mb-20 space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Create Lot</h1>
      </header>

      <form onSubmit={handleSave} className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">System Lot ID</label>
          <input readOnly type="text" value={lotNumber} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-gray-500" />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Lot Name (Optional)</label>
          <input type="text" value={lotName} onChange={e => setLotName(e.target.value)} className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-medium transition-shadow" placeholder="e.g. Summer Batch, Front Yard" />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Plant Variety</label>
          <select required value={plantId} onChange={e => setPlantId(e.target.value)} className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-medium transition-shadow">
            <option value="">Select a plant...</option>
            {plants?.map(p => (
              <option key={p.id} value={p.id}>{p.plant_name}{p.variety ? ' - ' + p.variety : ''}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Total Quantity</label>
          <input required type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-medium transition-shadow" placeholder="e.g. 5000" />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Ready Date</label>
          <input required type="date" value={readyDate} onChange={e => setReadyDate(e.target.value)} className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-medium transition-shadow" />
        </div>

        <button type="submit" disabled={loading} className="w-full bg-green-600 text-white font-black text-lg p-4 rounded-xl mt-6 active:scale-95 transition-transform disabled:opacity-70 shadow-md">
          {loading ? 'Saving...' : 'Save Lot'}
        </button>
      </form>
    </div>
  );
}
