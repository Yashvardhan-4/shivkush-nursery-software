'use client';

import { useState, useMemo } from 'react';
import { Search, X, Check, Leaf, Sparkles } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export interface Plant {
  id: string;
  plant_name: string;
  variety?: string | null;
  category?: string | null;
  selling_price: number;
  active?: boolean;
}

interface PlantPickerProps {
  plants: Plant[];
  selectedPlantId: string;
  onSelectPlant: (plant: Plant | null) => void;
  accentColor?: 'green' | 'blue';
}

const CATEGORY_MAP: Record<string, { labelMr: string; labelEn: string; icon: string }> = {
  All: { labelMr: 'सर्व', labelEn: 'All', icon: '🌱' },
  Vegetable: { labelMr: 'भाजीपाला', labelEn: 'Vegetable', icon: '🥦' },
  Fruit: { labelMr: 'फळझाडे', labelEn: 'Fruit', icon: '🥭' },
  Flower: { labelMr: 'फुले', labelEn: 'Flower', icon: '🌸' },
  Other: { labelMr: 'इतर', labelEn: 'Other', icon: '🌿' }
};

export default function PlantPicker({
  plants,
  selectedPlantId,
  onSelectPlant,
  accentColor = 'green'
}: PlantPickerProps) {
  const { t, language } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // Active plants
  const activePlants = useMemo(() => {
    return plants.filter(p => p.active !== false);
  }, [plants]);

  // Selected Plant Object
  const selectedPlant = useMemo(() => {
    return activePlants.find(p => p.id === selectedPlantId) || null;
  }, [activePlants, selectedPlantId]);

  // Dynamic Categories Present in Data
  const categories = useMemo(() => {
    const set = new Set<string>();
    activePlants.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return ['All', ...Array.from(set)];
  }, [activePlants]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: activePlants.length };
    activePlants.forEach(p => {
      const c = p.category || 'Other';
      counts[c] = (counts[c] || 0) + 1;
    });
    return counts;
  }, [activePlants]);

  // Filtered Plants based on Category & Search
  const filteredPlants = useMemo(() => {
    return activePlants.filter(p => {
      // Category match
      if (selectedCategory !== 'All' && (p.category || 'Other') !== selectedCategory) {
        return false;
      }

      // Search match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = p.plant_name?.toLowerCase().includes(q);
        const varietyMatch = p.variety?.toLowerCase().includes(q);
        const catMatch = p.category?.toLowerCase().includes(q);
        return nameMatch || varietyMatch || catMatch;
      }

      return true;
    });
  }, [activePlants, selectedCategory, searchQuery]);

  // Fast-moving nursery crop tags (Common Quick Picks)
  const popularCrops = ['टोमॅटो', 'मिरची', 'वांग', 'झेंडू', 'शेवगा', 'पेरू', 'डाळिंब'];

  const isGreen = accentColor === 'green';
  const borderFocus = isGreen ? 'focus:ring-green-500' : 'focus:ring-blue-500';
  const activeTabBg = isGreen ? 'bg-green-600 text-white shadow-md' : 'bg-blue-600 text-white shadow-md';
  const selectedBorder = isGreen ? 'border-green-600 bg-green-50' : 'border-blue-600 bg-blue-50';

  return (
    <div className="space-y-3.5">
      {/* 1. Category Filter Pills */}
      <div>
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <label className="text-xs font-black uppercase text-gray-500 tracking-wider">
            वर्गवारी निवडा (Category)
          </label>
          <span className="text-[11px] font-bold text-gray-400">
            {filteredPlants.length} रोपे उपलब्ध
          </span>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {categories.map(cat => {
            const meta = CATEGORY_MAP[cat] || {
              labelMr: cat,
              labelEn: cat,
              icon: '🌿'
            };
            const isSelected = selectedCategory === cat;
            const count = categoryCounts[cat] || 0;

            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat);
                  setIsExpanded(true);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 whitespace-nowrap transition-all active:scale-95 border ${
                  isSelected
                    ? `${activeTabBg} border-transparent`
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}
              >
                <span>{meta.icon}</span>
                <span>{language === 'mr' ? meta.labelMr : meta.labelEn}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    isSelected ? 'bg-white/30 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Instant Search Box */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => {
            setSearchQuery(e.target.value);
            setIsExpanded(true);
          }}
          placeholder="रोपाचे नाव किंवा जात शोधा (उदा. टोमॅटो, मिरची, वांग...)"
          className={`w-full pl-10 pr-9 py-3 bg-white border border-gray-200 rounded-xl outline-none ${borderFocus} font-bold text-sm text-gray-900 shadow-2xs`}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 3. Common Quick-Picks (वारंवार लागणारी रोपे) */}
      {!searchQuery && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs font-bold text-gray-500">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1 shrink-0">
            <Sparkles className="w-3 h-3 text-amber-500" /> जलद:
          </span>
          {popularCrops.map(crop => (
            <button
              key={crop}
              type="button"
              onClick={() => {
                setSearchQuery(crop);
                setIsExpanded(true);
              }}
              className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 shrink-0 active:scale-95 transition-all"
            >
              {crop}
            </button>
          ))}
        </div>
      )}

      {/* 4. Active Selected Plant Banner (If a plant is chosen) */}
      {selectedPlant && (
        <div className={`p-3.5 rounded-2xl border-2 ${selectedBorder} flex items-center justify-between shadow-2xs animate-in fade-in`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black ${isGreen ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'}`}>
              <Check className="w-5 h-5 stroke-[3]" />
            </div>
            <div>
              <p className="font-black text-gray-900 text-sm sm:text-base">
                {selectedPlant.plant_name} {selectedPlant.variety ? `— ${selectedPlant.variety}` : ''}
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-gray-500">
                  दर: <strong className="text-gray-900 font-black">₹{selectedPlant.selling_price}</strong> / रोप
                </span>
                {selectedPlant.category && (
                  <span className="bg-white/80 px-2 py-0.5 rounded-md text-[10px] font-bold text-gray-600 border border-gray-200">
                    {CATEGORY_MAP[selectedPlant.category]?.labelMr || selectedPlant.category}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onSelectPlant(null);
              setIsExpanded(true);
            }}
            className="text-xs font-black text-red-600 bg-white hover:bg-red-50 border border-red-200 px-3 py-1.5 rounded-xl active:scale-95 transition-all"
          >
            बदला (Change)
          </button>
        </div>
      )}

      {/* 5. Scrollable Plant Selection Grid / Cards */}
      {(!selectedPlant || isExpanded) && (
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-bold text-gray-500 px-1">
            <span>रोप निवडा (खालील यादीतून टॅप करा):</span>
            {selectedPlant && (
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                बंद करा ▲
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-2xl bg-white p-2 divide-y divide-gray-100 shadow-inner">
            {filteredPlants.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs font-bold">
                '{searchQuery}' साठी कोणतेही रोप सापडले नाही.
              </div>
            ) : (
              filteredPlants.map(plant => {
                const isSelected = plant.id === selectedPlantId;
                const catInfo = CATEGORY_MAP[plant.category || 'Other'] || {
                  labelMr: plant.category || 'इतर',
                  icon: '🌱'
                };

                return (
                  <button
                    key={plant.id}
                    type="button"
                    onClick={() => {
                      onSelectPlant(plant);
                      setIsExpanded(false);
                    }}
                    className={`w-full p-3 rounded-xl text-left flex items-center justify-between transition-all active:scale-98 ${
                      isSelected
                        ? `${isGreen ? 'bg-green-100 text-green-950 font-black' : 'bg-blue-100 text-blue-950 font-black'}`
                        : 'hover:bg-gray-50 text-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{catInfo.icon}</span>
                      <div>
                        <p className="font-black text-sm text-gray-900 leading-tight">
                          {plant.plant_name}
                        </p>
                        <p className="text-xs font-semibold text-gray-500 mt-0.5">
                          {plant.variety ? `जात: ${plant.variety}` : 'सामान्य रोप'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-black text-sm text-gray-900 block">
                        ₹{plant.selling_price}
                      </span>
                      <span className="text-[10px] font-bold text-gray-400">
                        {catInfo.labelMr}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
