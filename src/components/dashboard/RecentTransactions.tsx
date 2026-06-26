'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toLocalDateStr } from '@/lib/utils';
import { Banknote, ShoppingCart, User, BookOpen, Truck } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function RecentTransactions({ workerId }: { workerId?: string }) {
  const { t } = useLanguage();

  const { data: allTransactions } = useQuery({ queryKey: ['transactions'], queryFn: async () => { const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false }); return data || []; } });
  const { data: allUsers } = useQuery({ queryKey: ['users'], queryFn: async () => { const { data } = await supabase.from('users').select('*'); return data || []; } });

  if (!allTransactions || !allUsers) {
    return (
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  const userMap = new Map(allUsers.map(u => [u.id, u.name]));

  let ledger = allTransactions.map(t => {
    let title = t.customer_name || 'Walk In';
    if (t.reference_type === 'DIRECT_SALE') title = `${t.customer_name || 'Walk In'} (${t.plant_names})`;
    else if (t.reference_type === 'BOOKING_ADVANCE') title = `Advance - ${t.customer_name || 'Walk In'}`;
    else if (t.reference_type === 'BOOKING_DELIVERY') title = `Final Pay - ${t.customer_name || 'Walk In'}`;

    return {
      id: t.id,
      date: new Date(t.created_at).getTime(),
      displayDate: new Date(t.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hour12: true }),
      title,
      amount: t.amount,
      mode: t.payment_mode,
      cashAmount: t.cash_amount,
      upiAmount: t.upi_amount,
      worker: userMap.get(t.worker_id) || 'Unknown Worker',
      type: t.reference_type === 'DIRECT_SALE' ? 'sale' : t.reference_type === 'BOOKING_ADVANCE' ? 'advance' : 'final'
    };
  });

  if (workerId) {
    ledger = ledger.filter(l => l.worker_id === workerId);
  }

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
