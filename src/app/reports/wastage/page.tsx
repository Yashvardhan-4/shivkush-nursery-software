'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, AlertTriangle, Leaf } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

function toLocalDateStr(dateVal: number | string | Date): string {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function WastageReportPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data: adjustments, isLoading } = useQuery({
    queryKey: ['stock_adjustments_report'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_adjustments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  const { data: plants } = useQuery({
    queryKey: ['plants'],
    queryFn: async () => {
      const { data } = await supabase.from('plants').select('*');
      return data || [];
    }
  });

  if (isLoading || !adjustments || !plants) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
      </div>
    );
  }

  const records = adjustments.map((adj: any) => {
    const plant = plants.find((p: any) => p.id === adj.plant_id);
    const plantName = plant 
      ? (plant.variety ? `${plant.plant_name} - ${plant.variety}` : plant.plant_name) 
      : 'Unknown Plant';

    return {
      id: adj.id,
      date: toLocalDateStr(adj.created_at || Date.now()),
      plant_name: plantName,
      type: adj.adjustment_type,
      reason: adj.reason || adj.adjustment_type,
      quantityDelta: adj.quantity_delta,
      isLoss: adj.quantity_delta < 0,
      lostQty: adj.quantity_delta < 0 ? Math.abs(adj.quantity_delta) : 0,
      surplusQty: adj.quantity_delta > 0 ? adj.quantity_delta : 0
    };
  });

  const filteredRecords = records.filter((r: any) => 
    r.plant_name.toLowerCase().includes(search.toLowerCase()) ||
    r.type.toLowerCase().includes(search.toLowerCase()) ||
    r.reason.toLowerCase().includes(search.toLowerCase())
  );

  const totalLost = filteredRecords.reduce((sum: number, r: any) => sum + r.lostQty, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 active:scale-95 transition-all shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-black text-gray-900 tracking-tight leading-none">Stock Adjustments & Loss</h1>
              <p className="text-[11px] font-bold text-gray-500 mt-0.5">Audit log of mortality, recounting & damages</p>
            </div>
          </div>
        </div>
        
        {/* Search Bar */}
        <div className="px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by plant, adjustment type or reason..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-100 border-none rounded-xl text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-amber-500 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Summary Card */}
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-4 text-white shadow-sm shadow-amber-600/20">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/80 text-xs font-bold tracking-wider uppercase mb-1">Total Loss / Wastage Recorded</p>
              <p className="text-3xl font-black">{totalLost} <span className="text-lg font-bold text-white/70">plants</span></p>
            </div>
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>

        {/* Records List */}
        <div className="space-y-3 mt-6">
          <h2 className="text-sm font-black text-gray-900 px-1">Adjustment Logs ({filteredRecords.length})</h2>
          
          {filteredRecords.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
              <p className="text-4xl mb-3">🌱</p>
              <p className="text-sm font-bold text-gray-900">No adjustments found</p>
              <p className="text-xs font-medium text-gray-500 mt-1">Healthy nursery!</p>
            </div>
          ) : (
            filteredRecords.map((record: any) => (
              <div key={record.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm relative overflow-hidden">
                <div className="relative z-10 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Leaf className="w-3.5 h-3.5 text-gray-400" />
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          record.isLoss ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                        }`}>
                          {record.type.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <h3 className="text-base font-black text-gray-900 leading-tight">{record.plant_name}</h3>
                      <p className="text-xs font-medium text-gray-500 mt-1">{record.date}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-black ${record.isLoss ? 'text-red-600' : 'text-green-600'}`}>
                        {record.quantityDelta > 0 ? `+${record.quantityDelta}` : record.quantityDelta}
                      </p>
                      <p className="text-[10px] font-bold text-gray-400">saplings</p>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-xs font-bold text-gray-700 flex items-start gap-1.5 leading-relaxed">
                      <span className="font-black text-gray-900">Reason:</span> {record.reason}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
