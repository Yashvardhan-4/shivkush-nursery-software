'use client';

import { supabase } from '@/lib/supabaseClient';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Search, Pencil } from 'lucide-react';

export default function PlantList({ role }: { role: string }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  
  const { data: plants } = useQuery({
    queryKey: ['plants', search, categoryFilter],
    queryFn: async () => {
      let query = supabase.from('plants').select('*').is('deleted_at', null).eq('active', true);
      
      if (categoryFilter !== 'All') {
        query = query.eq('category', categoryFilter);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      let filtered = data || [];
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter((p: any) => 
          p.plant_name.toLowerCase().includes(s) || 
          (p.variety && p.variety.toLowerCase().includes(s))
        );
      }
      
      return filtered;
    }
  });

  if (!plants) return <div className="p-4 text-center text-gray-500 mt-10 font-medium">Loading plants...</div>;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input 
          type="text"
          placeholder="Search Plant"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-green-500 font-medium shadow-sm transition-shadow"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {['All', 'Vegetable', 'Fruit', 'Flower', 'Timber', 'Other'].map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${
              categoryFilter === cat 
                ? 'bg-green-600 text-white shadow-md' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {plants.map(plant => (
          <div key={plant.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-start active:scale-[0.98] transition-transform">
            <div className="flex-1 min-w-0">
              <h3 className="font-extrabold text-gray-900 text-lg">{plant.plant_name}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {plant.category && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 uppercase tracking-wider border border-blue-100">
                    {plant.category}
                  </span>
                )}
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{plant.variety}</p>
              </div>
              {/* Pricing Tiers */}
              {plant.pricing_tiers && plant.pricing_tiers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[...plant.pricing_tiers]
                    .sort((a, b) => a.min_quantity - b.min_quantity)
                    .map(tier => (
                      <span
                        key={tier.min_quantity}
                        className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
                      >
                        ≥{tier.min_quantity} → ₹{tier.price}
                      </span>
                    ))}
                </div>
              )}
            </div>
            <div className="flex items-center space-x-3 shrink-0 ml-3">
              <div className="text-right bg-green-50 px-3 py-2 rounded-xl">
                <span className="font-black text-green-700 text-lg">₹{plant.selling_price}</span>
              </div>
              {role === 'owner' && (
                <a href={`/plants/${plant.id}/edit`} className="p-2 bg-gray-100 rounded-xl text-gray-500 hover:bg-gray-200 active:scale-95 transition-all">
                  <Pencil className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

        ))}
        {plants.length === 0 && (
          <div className="text-center p-12 bg-white rounded-2xl border border-gray-100 border-dashed">
            <p className="text-gray-500 font-medium">No plants found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
