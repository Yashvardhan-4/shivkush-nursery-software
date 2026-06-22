'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { db, generateId } from '@/lib/db';
import type { PricingTier } from '@/lib/db';
import { ArrowLeft, Plus, Trash2, Tag } from 'lucide-react';

export default function NewPlantPage() {
  const [name, setName] = useState('');
  const [variety, setVariety] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [newTierQty, setNewTierQty] = useState('');
  const [newTierPrice, setNewTierPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleAddTier = () => {
    const qty = parseInt(newTierQty);
    const p = parseFloat(newTierPrice);
    if (isNaN(qty) || qty <= 0 || isNaN(p) || p <= 0) return;
    // Prevent duplicate thresholds
    if (pricingTiers.some(t => t.min_quantity === qty)) {
      alert(`A tier for quantity ≥${qty} already exists.`);
      return;
    }
    const updated = [...pricingTiers, { min_quantity: qty, price: p }]
      .sort((a, b) => a.min_quantity - b.min_quantity);
    setPricingTiers(updated);
    setNewTierQty('');
    setNewTierPrice('');
  };

  const handleRemoveTier = (qty: number) => {
    setPricingTiers(pricingTiers.filter(t => t.min_quantity !== qty));
  };

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
      pricing_tiers: pricingTiers,
    };

    await db.plants.add(newPlant);
    await db.sync_queue.add({
      table: 'plants',
      action: 'INSERT',
      payload: newPlant,
      created_at: Date.now(),
    });

    window.dispatchEvent(new Event('online'));
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
          <label className="text-sm font-bold text-gray-700">Standard Price (₹) <span className="text-gray-400 font-normal text-xs">— applies when no quantity tier matches</span></label>
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

        {/* Quantity-based Pricing Tiers */}
        <div className="space-y-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-amber-600" />
            <h3 className="font-black text-amber-800 text-sm">Quantity Tier Pricing <span className="text-amber-500 font-medium">(Optional)</span></h3>
          </div>
          <p className="text-xs text-amber-700 font-medium">Set a lower price for bulk orders. E.g. ₹4 per plant when ordering 100 or more.</p>

          {/* Existing tiers */}
          {pricingTiers.length > 0 && (
            <div className="space-y-2">
              {pricingTiers.map((tier) => (
                <div key={tier.min_quantity} className="flex items-center justify-between bg-white border border-amber-200 rounded-xl px-4 py-3">
                  <div>
                    <span className="text-xs font-black text-gray-500 uppercase tracking-wider">Min Qty </span>
                    <span className="font-black text-gray-900 text-sm">≥{tier.min_quantity}</span>
                    <span className="mx-2 text-gray-300">→</span>
                    <span className="font-black text-green-700 text-sm">₹{tier.price}</span>
                    <span className="text-xs text-gray-400 font-medium"> per plant</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveTier(tier.min_quantity)}
                    className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new tier */}
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Min Qty</label>
              <input
                type="number"
                min="1"
                value={newTierQty}
                onChange={(e) => setNewTierQty(e.target.value)}
                className="w-full p-3 bg-white border border-amber-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-400 font-bold text-center text-sm"
                placeholder="e.g. 100"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Price (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newTierPrice}
                onChange={(e) => setNewTierPrice(e.target.value)}
                className="w-full p-3 bg-white border border-amber-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-400 font-bold text-center text-sm"
                placeholder="e.g. 4"
              />
            </div>
            <button
              type="button"
              onClick={handleAddTier}
              className="p-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl active:scale-95 transition-all shrink-0"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
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
