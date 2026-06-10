'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Banknote, ShoppingCart, User } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function RecentTransactions({ workerId }: { workerId?: string }) {
  const { t } = useLanguage();

  const allSales = useLiveQuery(() => db.direct_sales.toArray());
  const allBookings = useLiveQuery(() => db.bookings.toArray());
  const allUsers = useLiveQuery(() => db.users.toArray());
  const allPlants = useLiveQuery(() => db.plants.toArray());

  if (!allSales || !allBookings || !allUsers || !allPlants) {
    return (
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  // Create lookup maps
  const userMap = new Map(allUsers.map(u => [u.id, u.name]));
  const plantMap = new Map(allPlants.map(p => [p.id, p.plant_name]));

  // Build unified ledger
  const ledger: any[] = [];

  // 1. Direct Sales
  for (const sale of allSales) {
    if (workerId && sale.worker_id !== workerId) continue;
    ledger.push({
      id: sale.id,
      date: new Date(sale.created_at).getTime(),
      displayDate: new Date(sale.created_at).toLocaleString('en-IN', { hour: 'numeric', minute: 'numeric', hour12: true }),
      title: `Sale: ${plantMap.get(sale.plant_id) || 'Plant'} (x${sale.quantity})`,
      amount: sale.amount,
      mode: sale.payment_mode,
      worker: userMap.get(sale.worker_id) || 'Unknown Worker',
      type: 'sale'
    });
  }

  // 2. Bookings (Advance Payments)
  for (const b of allBookings) {
    if (workerId && b.worker_id !== workerId) continue;
    if (b.advance_paid && b.advance_paid > 0) {
      const dateStr = b.created_at || b.booking_date;
      ledger.push({
        id: b.id + '_adv',
        date: new Date(dateStr).getTime(),
        displayDate: new Date(dateStr).toLocaleString('en-IN', { hour: 'numeric', minute: 'numeric', hour12: true }),
        title: `Advance: Booking #${b.booking_number}`,
        amount: b.advance_paid,
        mode: b.advance_payment_mode || 'Unknown',
        worker: userMap.get(b.worker_id || '') || 'Unknown Worker',
        type: 'booking'
      });
    }

    // 3. Bookings (Final Payments upon Delivery)
    if (b.status === 'Delivered' && b.total_amount > (b.advance_paid || 0)) {
       const balance = b.total_amount - (b.advance_paid || 0);
       const dateStr = b.delivery_date || b.booking_date; // fallback
       ledger.push({
         id: b.id + '_final',
         date: new Date(dateStr).getTime(),
         displayDate: new Date(dateStr).toLocaleDateString('en-IN'),
         title: `Final Pay: Booking #${b.booking_number}`,
         amount: balance,
         mode: b.payment_mode || 'Unknown',
         worker: userMap.get(b.worker_id || '') || 'Unknown Worker',
         type: 'booking'
       });
    }
  }

  // Sort by newest first
  ledger.sort((a, b) => b.date - a.date);

  // Take top 10
  const recentLedger = ledger.slice(0, 10);

  function fmt(n: number) {
    return '₹' + n.toLocaleString('en-IN');
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-5 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
        <h2 className="font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
          <Banknote className="w-5 h-5 text-green-600" />
          {workerId ? "My Recent Collections" : "Recent Collections"}
        </h2>
      </div>

      {recentLedger.length === 0 ? (
        <div className="p-8 text-center text-gray-400 font-medium">
          No collections found.
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {recentLedger.map((item) => (
            <div key={item.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  item.type === 'sale' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                }`}>
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{item.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-semibold text-gray-500">{item.displayDate}</span>
                    <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                    <span className="text-xs font-bold text-gray-400 flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {item.worker}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="font-black text-gray-900">{fmt(item.amount)}</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{item.mode}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
