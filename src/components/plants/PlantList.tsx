'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useState } from 'react';
import { Search, Pencil } from 'lucide-react';

export default function PlantList({ role }: { role: string }) {
  const [search, setSearch] = useState('');
  
  const plants = useLiveQuery(
    () => db.plants
      .filter(p => p.active !== false && (
        p.plant_name.toLowerCase().includes(search.toLowerCase()) || 
        (p.variety && p.variety.toLowerCase().includes(search.toLowerCase()))
      ))
      .toArray(),
    [search]
  );

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

      <div className="grid gap-3">
        {plants.map(plant => (
          <div key={plant.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center active:scale-[0.98] transition-transform">
            <div>
              <h3 className="font-extrabold text-gray-900 text-lg">{plant.plant_name}</h3>
              <p className="text-xs font-semibold text-gray-500 mt-1 uppercase tracking-wider">{plant.variety}</p>
            </div>
            <div className="flex items-center space-x-3">
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
