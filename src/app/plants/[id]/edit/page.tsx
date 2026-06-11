'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { ArrowLeft, ArchiveX } from 'lucide-react';

export default function EditPlantPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  const [name, setName] = useState('');
  const [variety, setVariety] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Load plant on mount
  useEffect(() => {
    const fetchPlant = async () => {
      const plant = await db.plants.get(id);
      if (!plant) {
        setNotFound(true);
      } else {
        setName(plant.plant_name);
        setVariety(plant.variety);
        setPrice(String(plant.selling_price));
      }
      setInitialLoading(false);
    };
    fetchPlant();
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const plant = await db.plants.get(id);
    if (!plant) {
      setLoading(false);
      return;
    }

    const updatedPlant = {
      ...plant,
      plant_name: name,
      variety: variety,
      selling_price: parseFloat(price),
    };

    // Update in IndexedDB
    await db.plants.put(updatedPlant);

    // Queue sync
    await db.sync_queue.add({
      table: 'plants',
      action: 'UPDATE',
      payload: { ...updatedPlant, sync_status: undefined },
      created_at: Date.now(),
    });

    window.dispatchEvent(new Event('online'));
    router.push('/plants');
  };

  const handleArchive = async () => {
    if (!confirm('Archive this plant? It will be hidden from active lists.')) return;
    setArchiving(true);

    const plant = await db.plants.get(id);
    if (!plant) {
      setArchiving(false);
      return;
    }

    const updatedPlant = { ...plant, active: false };

    await db.plants.put(updatedPlant);

    await db.sync_queue.add({
      table: 'plants',
      action: 'UPDATE',
      payload: { ...updatedPlant, sync_status: undefined },
      created_at: Date.now(),
    });

    window.dispatchEvent(new Event('online'));
    router.push('/plants');
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 font-medium">Loading plant...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-gray-500 font-semibold text-lg">Plant not found.</p>
        <button
          onClick={() => router.push('/plants')}
          className="text-green-600 font-bold underline"
        >
          Back to Plants
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 mb-20 space-y-6">
      {/* Header */}
      <header className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl bg-gray-100 active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Edit Plant</h1>
          <p className="text-sm font-medium text-gray-500 mt-0.5">Update plant details</p>
        </div>
      </header>

      {/* Form */}
      <form onSubmit={handleSave} className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Plant Name</label>
          <input
            required
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-medium transition-shadow"
            placeholder="e.g. Mango Graft"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Variety</label>
          <input
            required
            type="text"
            value={variety}
            onChange={(e) => setVariety(e.target.value)}
            className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-medium transition-shadow"
            placeholder="e.g. Grafted, Seedling"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">Selling Price (₹)</label>
          <input
            required
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-medium transition-shadow"
            placeholder="e.g. 150"
          />
          <p className="text-sm text-amber-600 mt-1">Warning: Changing this price will only apply to future bookings. Existing bookings will retain their original price.</p>
        </div>

        {/* Save button */}
        <button
          type="submit"
          disabled={loading || archiving}
          className="w-full bg-green-600 text-white font-black text-lg p-4 rounded-xl mt-4 active:scale-95 transition-transform disabled:opacity-70 shadow-md"
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </form>

      {/* Archive / Disable */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleArchive}
          disabled={loading || archiving}
          className="w-full flex items-center justify-center gap-2 border-2 border-red-200 text-red-600 font-bold text-base p-4 rounded-xl active:scale-95 transition-transform disabled:opacity-70 bg-red-50"
        >
          <ArchiveX className="w-5 h-5" />
          {archiving ? 'Archiving...' : 'Disable / Archive Plant'}
        </button>
        <p className="text-xs text-center text-gray-400 mt-2 font-medium">
          Archived plants are hidden from active lists but not deleted.
        </p>
      </div>
    </div>
  );
}
