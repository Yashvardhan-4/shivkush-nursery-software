'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export default function SaleList() {
  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ['direct_sales'],
    queryFn: async () => {
      const { data } = await supabase.from('direct_sales').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      return data || [];
    }
  });

  const { data: plants, isLoading: plantsLoading } = useQuery({
    queryKey: ['plants'],
    queryFn: async () => {
      const { data } = await supabase.from('plants').select('*').is('deleted_at', null);
      return data || [];
    }
  });

  if (salesLoading || plantsLoading || !sales || !plants) {
    return <div className="p-4 text-center text-gray-500 font-medium">Loading sales...</div>;
  }

  return (
    <div className="space-y-4">
      {sales.map(sale => {
        const plant = plants.find(p => p.id === sale.plant_id);
        
        return (
          <div key={sale.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center active:scale-[0.98] transition-transform">
            <div>
              <p className="font-bold text-gray-900 text-lg">{plant ? (plant.variety ? `${plant.plant_name} - ${plant.variety}` : plant.plant_name) : 'Unknown Plant'}</p>
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
      {sales.length === 0 && (
        <div className="text-center p-12 bg-white rounded-2xl border border-gray-100 border-dashed">
          <p className="text-gray-500 font-medium">No sales recorded yet.</p>
        </div>
      )}
    </div>
  );
}
