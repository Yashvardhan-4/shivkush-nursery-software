'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

export default function SaleList() {
  const sales = useLiveQuery(() => db.direct_sales.toArray());
  const plants = useLiveQuery(() => db.plants.toArray());

  if (!sales || !plants) {
    return <div className="p-4 text-center text-gray-500 font-medium">Loading sales...</div>;
  }

  // Sort sales descending by creation date
  const sortedSales = [...sales].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="space-y-4">
      {sortedSales.map(sale => {
        const plant = plants.find(p => p.id === sale.plant_id);
        
        return (
          <div key={sale.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center active:scale-[0.98] transition-transform">
            <div>
              <p className="font-bold text-gray-900 text-lg">{plant?.plant_name || 'Unknown Plant'}</p>
              <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-wider">
                {sale.payment_mode} • Qty: {sale.quantity}
              </p>
            </div>
            <div className={`px-4 py-2 rounded-xl text-center shadow-inner ${sale.payment_mode === 'UPI' ? 'bg-blue-50' : 'bg-green-50'}`}>
              <span className={`font-black text-xl tracking-tight ${sale.payment_mode === 'UPI' ? 'text-blue-700' : 'text-green-700'}`}>
                ₹{sale.amount}
              </span>
            </div>
          </div>
        );
      })}
      {sortedSales.length === 0 && (
        <div className="text-center p-12 bg-white rounded-2xl border border-gray-100 border-dashed">
          <p className="text-gray-500 font-medium">No sales recorded yet.</p>
        </div>
      )}
    </div>
  );
}
