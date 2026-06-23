'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, AlertTriangle, Leaf } from 'lucide-react';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { toLocalDateStr } from '@/lib/utils';

export default function WastageReportPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  // We fetch audit logs, lots, and plants
  const auditLogs = useLiveQuery(() => db.audit_logs.where('action').equals('UPDATE_LOT').reverse().sortBy('created_at'));
  const lots = useLiveQuery(async () => (await db.lots.toArray()).filter(l => !l.deleted_at));
  const plants = useLiveQuery(async () => (await db.plants.toArray()).filter(p => !p.deleted_at));

  if (!auditLogs || !lots || !plants) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Process logs to find those with adjustment_reason
  const wastageRecords = auditLogs.filter(log => {
    try {
      const details = JSON.parse(log.details);
      return !!details.adjustment_reason;
    } catch {
      return false;
    }
  }).map(log => {
    const details = JSON.parse(log.details);
    const lot = lots.find(l => l.id === log.record_id);
    const plant = lot ? plants.find(p => p.id === lot.plant_id) : null;
    
    // Extract old vs new qty from notes if possible: "[Adjustment] Stock changed from 100 to 90 because: ..."
    let oldQty = 'Unknown';
    let newQty = details.total_quantity || 'Unknown';
    let lostQty = 0;
    
    if (details.notes) {
      const match = details.notes.match(/Stock changed from (\d+) to (\d+)/);
      if (match) {
        oldQty = match[1];
        newQty = match[2];
        lostQty = Number(oldQty) - Number(newQty);
      }
    }

    return {
      id: log.id,
      date: toLocalDateStr(log.created_at || Date.now()),
      user_name: log.user_name,
      lot_number: lot?.lot_number || details.lot_number || 'Unknown',
      lot_name: lot?.lot_name || details.lot_name || '',
      plant_name: plant?.plant_name || 'Unknown Plant',
      reason: details.adjustment_reason,
      lostQty,
      oldQty,
      newQty
    };
  });

  const filteredRecords = wastageRecords.filter(r => 
    r.plant_name.toLowerCase().includes(search.toLowerCase()) ||
    r.lot_number.toLowerCase().includes(search.toLowerCase()) ||
    r.reason.toLowerCase().includes(search.toLowerCase())
  );

  const totalLost = filteredRecords.reduce((sum, r) => sum + r.lostQty, 0);

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
              <h1 className="text-lg font-black text-gray-900 tracking-tight leading-none">Loss & Wastage</h1>
              <p className="text-[11px] font-bold text-gray-500 mt-0.5">Track dead/damaged plants</p>
            </div>
          </div>
        </div>
        
        {/* Search Bar */}
        <div className="px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by plant, lot or reason..."
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
              <p className="text-white/80 text-xs font-bold tracking-wider uppercase mb-1">Total Wastage Recorded</p>
              <p className="text-3xl font-black">{totalLost} <span className="text-lg font-bold text-white/70">plants</span></p>
            </div>
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>

        {/* Records List */}
        <div className="space-y-3 mt-6">
          <h2 className="text-sm font-black text-gray-900 px-1">Adjustment Logs</h2>
          
          {filteredRecords.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
              <p className="text-4xl mb-3">🌱</p>
              <p className="text-sm font-bold text-gray-900">No wastage recorded</p>
              <p className="text-xs font-medium text-gray-500 mt-1">Healthy nursery!</p>
            </div>
          ) : (
            filteredRecords.map((record) => (
              <div key={record.id} className="bg-white rounded-2xl border border-red-100 p-4 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-red-50 rounded-bl-[100px] -z-0"></div>
                <div className="relative z-10 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Leaf className="w-3.5 h-3.5 text-red-500" />
                        <span className="text-xs font-black tracking-wider text-red-600 uppercase">{record.lot_number} {record.lot_name ? `(${record.lot_name})` : ''}</span>
                      </div>
                      <h3 className="text-base font-black text-gray-900 leading-tight">{record.plant_name}</h3>
                      <p className="text-xs font-medium text-gray-500 mt-1">By {record.user_name} on {record.date}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black text-red-600">-{record.lostQty}</p>
                      <p className="text-[10px] font-bold text-gray-400">Qty: {record.oldQty} → {record.newQty}</p>
                    </div>
                  </div>
                  
                  <div className="bg-red-50 rounded-xl p-3 border border-red-100">
                    <p className="text-xs font-bold text-red-800 flex items-start gap-1.5 leading-relaxed">
                      <span className="font-black">Reason:</span> {record.reason}
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
