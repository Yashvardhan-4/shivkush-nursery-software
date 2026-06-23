'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toLocalDateStr } from '@/lib/utils';
import { Banknote, ShoppingCart, User, BookOpen, Truck } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function RecentTransactions({ workerId }: { workerId?: string }) {
  const { t } = useLanguage();

  const { data: allSales } = useQuery({ queryKey: ['direct_sales'], queryFn: async () => { const { data } = await supabase.from('direct_sales').select('*').is('deleted_at', null); return data || []; } });
  const { data: allBookings } = useQuery({ queryKey: ['bookings'], queryFn: async () => { const { data } = await supabase.from('bookings').select('*').is('deleted_at', null); return data || []; } });
  const { data: allUsers } = useQuery({ queryKey: ['users'], queryFn: async () => { const { data } = await supabase.from('users').select('*').is('deleted_at', null); return data || []; } });
  const { data: allPlants } = useQuery({ queryKey: ['plants'], queryFn: async () => { const { data } = await supabase.from('plants').select('*').is('deleted_at', null).eq('active', true); return data || []; } });
  const { data: allAuditLogs } = useQuery({ queryKey: ['audit_logs'], queryFn: async () => { const { data } = await supabase.from('audit_logs').select('*'); return data || []; } });

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

  // 1. Direct Sales (Grouped by sale_number)
  const salesByNo: Record<string, typeof allSales> = {};
  for (const sale of allSales) {
    if (workerId && sale.worker_id !== workerId) continue;
    if (!salesByNo[sale.sale_number]) {
      salesByNo[sale.sale_number] = [];
    }
    salesByNo[sale.sale_number].push(sale);
  }

  for (const [saleNo, items] of Object.entries(salesByNo)) {
    const first = items[0];
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const plantNames = items.map(item => `${plantMap.get(item.plant_id) || 'Plant'} (x${item.quantity})`).join(', ');

    ledger.push({
      id: `ds_${saleNo}`,
      date: new Date(first.created_at).getTime(),
      displayDate: new Date(first.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hour12: true }),
      title: `${t('Sale')} - ${first.customer_name || t('walkIn')} (${plantNames})`,
      amount: totalAmount,
      mode: first.payment_mode,
      cashAmount: first.cash_amount,
      upiAmount: first.upi_amount,
      worker: userMap.get(first.worker_id) || 'Unknown Worker',
      type: 'sale'
    });
  }

  // 2. Bookings (Advance & Final Payments Grouped by booking_number)
  const bookingsByNo: Record<string, typeof allBookings> = {};
  for (const b of allBookings) {
    if (workerId && b.worker_id !== workerId) continue;
    if (!bookingsByNo[b.booking_number]) {
      bookingsByNo[b.booking_number] = [];
    }
    bookingsByNo[b.booking_number].push(b);
  }

  for (const [bookingNo, items] of Object.entries(bookingsByNo)) {
    const first = items[0];
    const plantNames = items.map(item => `${plantMap.get(item.plant_id) || 'Plant'} (x${item.quantity})`).join(', ');

    // Grouped Advance
    const totalAdvance = items.reduce((sum, item) => sum + (item.advance_paid || 0), 0);
    if (totalAdvance > 0) {
      const dateStr = first.created_at || first.booking_date;
      
      // Sum split details
      let totalCash: number | undefined = undefined;
      let totalUpi: number | undefined = undefined;
      items.forEach(item => {
        if (item.advance_cash_amount !== undefined && item.advance_cash_amount !== null) {
          totalCash = (totalCash || 0) + item.advance_cash_amount;
        }
        if (item.advance_upi_amount !== undefined && item.advance_upi_amount !== null) {
          totalUpi = (totalUpi || 0) + item.advance_upi_amount;
        }
      });

      ledger.push({
        id: `adv_${bookingNo}`,
        date: new Date(dateStr).getTime(),
        displayDate: new Date(dateStr).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hour12: true }),
        title: `${t('Advance')} - ${first.customer_name || t('walkIn')} (${plantNames})`,
        amount: totalAdvance,
        mode: first.advance_payment_mode || 'Cash',
        cashAmount: totalCash,
        upiAmount: totalUpi,
        worker: userMap.get(first.worker_id || '') || 'Unknown Worker',
        type: 'advance'
      });
    }

    // Grouped Final Payment (collected on delivery)
    const deliveredItems = items.filter(item => item.status === 'Delivered');
    if (deliveredItems.length > 0) {
      const totalBalance = deliveredItems.reduce((sum, item) => sum + Math.max(0, item.total_amount - (item.advance_paid || 0)), 0);
      if (totalBalance > 0) {
        // Priority: exact delivery timestamp from Audit Log > End of delivery day > End of booking day
        let exactTime = deliveryLogs.get(bookingNo);
        if (!exactTime) {
          const dStr = first.delivery_date || first.booking_date;
          exactTime = new Date(dStr).setHours(23, 59, 59, 999);
        }

        // Sum split details
        let totalCash: number | undefined = undefined;
        let totalUpi: number | undefined = undefined;
        deliveredItems.forEach(item => {
          if (item.cash_amount !== undefined && item.cash_amount !== null) {
            totalCash = (totalCash || 0) + item.cash_amount;
          }
          if (item.upi_amount !== undefined && item.upi_amount !== null) {
            totalUpi = (totalUpi || 0) + item.upi_amount;
          }
        });

        ledger.push({
          id: `final_${bookingNo}`,
          date: exactTime,
          displayDate: new Date(exactTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hour12: true }),
          title: `${t('Final Pay')} - ${first.customer_name || t('walkIn')} (${plantNames})`,
          amount: totalBalance,
          mode: first.payment_mode || 'Cash',
          cashAmount: totalCash,
          upiAmount: totalUpi,
          worker: userMap.get(first.worker_id || '') || 'Unknown Worker',
          type: 'final'
        });
      }
    }
  }

  // Sort by newest first
  ledger.sort((a, b) => b.date - a.date);

  // Take top 30
  const recentLedger = ledger.slice(0, 30);

  // Group by date in Asia/Kolkata timezone
  const groupedLedger: { [key: string]: typeof ledger } = {};
  for (const item of recentLedger) {
    const dateKey = toLocalDateStr(item.date);
    if (!groupedLedger[dateKey]) groupedLedger[dateKey] = [];
    groupedLedger[dateKey].push(item);
  }

  function getDateLabel(dateKey: string) {
    const todayStr = toLocalDateStr();
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toLocalDateStr(yesterday);

    if (dateKey === todayStr) return t('today');
    if (dateKey === yesterdayStr) return t('yesterday');
    
    return new Date(dateKey).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmt(n: number) {
    return '₹' + n.toLocaleString('en-IN');
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-5">
      <div className="flex justify-between items-center mb-4 px-1">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">
            {workerId ? t('My Recent Collections') : t('Recent Collections')}
          </h2>
          <p className="text-sm font-bold text-gray-500 mt-1">{t('overview')}</p>
        </div>
        <a href="/transactions" className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg active:scale-95 transition-transform whitespace-nowrap">
          View All
        </a>
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
                  {items.map((item) => {
                    const iconColor = item.type === 'sale' ? 'bg-green-100 text-green-600' :
                                      item.type === 'advance' ? 'bg-blue-100 text-blue-600' :
                                      'bg-emerald-100 text-emerald-600';
                    const IconComponent = item.type === 'sale' ? ShoppingCart :
                                          item.type === 'advance' ? BookOpen :
                                          Truck;
                    return (
                      <div key={item.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconColor}`}>
                            <IconComponent className="w-5 h-5" />
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
                        <div className="text-right ml-4 shrink-0">
                          <p className="font-black text-gray-900">{fmt(item.amount)}</p>
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap inline-block mt-1 ${
                              item.mode === 'Cash'
                                ? 'bg-green-100 text-green-700'
                                : item.mode === 'UPI'
                                ? 'bg-blue-100 text-blue-700'
                                : item.mode === 'Split'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {item.mode === 'Split'
                              ? `${t('split')} (₹${item.cashAmount} 💵 + ₹${item.upiAmount} 📱)`
                              : t(String(item.mode || 'unknown').toLowerCase() as any).toUpperCase()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
