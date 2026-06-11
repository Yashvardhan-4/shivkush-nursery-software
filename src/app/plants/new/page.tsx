'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { db, generateId } from '@/lib/db';
import { ArrowLeft } from 'lucide-react';

export default function NewPlantPage() {
  const [name, setName] = useState('');
  const [variety, setVariety] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const newPlant = {
      id: generateId(),
      plant_name: name,
      variety: variety,
      category: category,
      selling_price: parseFloat(price),
      active: true,
    };

    // Save to offline DB
    await db.plants.add(newPlant);

    // Queue sync to Supabase
    await db.sync_queue.add({
      table: 'plants',
      action: 'INSERT',
      payload: newPlant,
      created_at: Date.now(),
    });

    window.dispatchEvent(new Event('online')); // Trigger background sync
    router.push('/plants');
  };

  return (
    <div className="p-6 mb-20 space-y-6">
      <header className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl bg-gray-100 active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Add Plant</h1>
          <p className="text-sm font-medium text-gray-500 mt-0.5">Create a new plant variety</p>
        </div>
      </header>

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
          <label className="text-sm font-bold text-gray-700">Category</label>
          <select
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full p-4 bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-medium transition-shadow appearance-none"
          >
            <option value="" disabled>Select Category</option>
            <option value="Vegetable">Vegetable</option>
            <option value="Fruit">Fruit</option>
            <option value="Flower">Flower</option>
            <option value="Timber">Timber</option>
            <option value="Other">Other</option>
          </select>
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
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white font-black text-lg p-4 rounded-xl mt-6 active:scale-95 transition-transform disabled:opacity-70 shadow-md"
        >
          {loading ? 'Saving...' : 'Save Plant'}
        </button>
      </form>
    </div>
  );
}
