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
  const allAuditLogs = useLiveQuery(() => db.audit_logs.toArray());

  if (!allSales || !allBookings || !allUsers || !allPlants || !allAuditLogs) {
    return (
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  // Create lookup maps
  const userMap = new Map(allUsers.map(u => [u.id, u.name]));
  const plantMap = new Map(allPlants.map(p => [p.id, p.variety ? `${p.plant_name} - ${p.variety}` : p.plant_name]));
  const deliveryLogs = new Map(allAuditLogs.filter(l => l.action === 'DELIVER_BOOKING').map(l => [l.record_id, new Date(l.created_at).getTime()]));

  // Build unified ledger
  const ledger: any[] = [];

  // 1. Direct Sales
  for (const sale of allSales) {
    if (workerId && sale.worker_id !== workerId) continue;
    ledger.push({
      id: sale.id,
      date: new Date(sale.created_at).getTime(),
      displayDate: new Date(sale.created_at).toLocaleString('en-IN', { hour: 'numeric', minute: 'numeric', hour12: true }),
      title: `${t('Sale')}: ${plantMap.get(sale.plant_id) || 'Plant'} (x${sale.quantity})`,
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
        title: `${t('Advance')}: ${t('bookingNo')} #${b.booking_number}`,
        amount: b.advance_paid,
        mode: b.advance_payment_mode || 'Unknown',
        worker: userMap.get(b.worker_id || '') || 'Unknown Worker',
        type: 'booking'
      });
    }

    // 3. Bookings (Final Payments upon Delivery)
    if (b.status === 'Delivered' && b.total_amount > (b.advance_paid || 0)) {
       const balance = b.total_amount - (b.advance_paid || 0);
       
       // Priority: exact delivery timestamp from Audit Log > End of delivery day > End of booking day
       let exactTime = deliveryLogs.get(b.booking_number);
       if (!exactTime) {
         const dStr = b.delivery_date || b.booking_date;
         exactTime = new Date(dStr).setHours(23, 59, 59, 999);
       }
       
       ledger.push({
         id: b.id + '_final',
         date: exactTime,
         displayDate: new Date(exactTime).toLocaleString('en-IN', { hour: 'numeric', minute: 'numeric', hour12: true }),
         title: `${t('Final Pay')}: ${t('bookingNo')} #${b.booking_number}`,
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

  // Group by date
  const groupedLedger: { [key: string]: typeof ledger } = {};
  for (const item of recentLedger) {
    const d = new Date(item.date);
    const dateKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (!groupedLedger[dateKey]) groupedLedger[dateKey] = [];
    groupedLedger[dateKey].push(item);
  }

  function getDateLabel(dateKey: string) {
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');

    if (dateKey === todayStr) return 'Today';
    if (dateKey === yesterdayStr) return 'Yesterday';
    
    return new Date(dateKey).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmt(n: number) {
    return '₹' + n.toLocaleString('en-IN');
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-5">
      <div className="flex justify-between items-end mb-4 px-1">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">
            {workerId ? t('My Recent Collections') : t('Recent Collections')}
          </h2>
          <p className="text-sm font-bold text-gray-500 mt-1">{t('overview')}</p>
        </div>
      </div>

      <div className="space-y-3">
        {ledger.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">{t('No recent collections')}</p>
        ) : (
          <div className="flex flex-col">
            {Object.entries(groupedLedger).map(([dateKey, items]) => (
              <div key={dateKey} className="flex flex-col mb-4 last:mb-0">
                <div className="py-2 px-1">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    {getDateLabel(dateKey)}
                  </span>
                </div>
                <div className="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden">
                  {items.map((item) => (
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
