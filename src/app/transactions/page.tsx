'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toLocalDateStr } from '@/lib/utils';
import { ShoppingCart, BookOpen, Truck, Search, ChevronLeft } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import Link from 'next/link';

export default function TransactionsPage() {
  const { t } = useLanguage();
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'All' | 'Cash' | 'UPI' | 'Split'>('All');
  const [filterType, setFilterType] = useState<'All' | 'sale' | 'advance' | 'final'>('All');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('snms_user');
    if (userStr) setCurrentUser(JSON.parse(userStr));
  }, []);


  const { data: allSalesQuery } = useQuery({ queryKey: ['direct_sales'], queryFn: async () => { const { data } = await supabase.from('direct_sales').select('*').is('deleted_at', null); return data || []; } });
  const { data: allBookingsQuery } = useQuery({ queryKey: ['bookings'], queryFn: async () => { const { data } = await supabase.from('bookings').select('*').is('deleted_at', null); return data || []; } });
  const { data: allUsers } = useQuery({ queryKey: ['users'], queryFn: async () => { const { data } = await supabase.from('users').select('*').is('deleted_at', null); return data || []; } });
  const { data: allPlants } = useQuery({ queryKey: ['plants'], queryFn: async () => { const { data } = await supabase.from('plants').select('*').is('deleted_at', null); return data || []; } });
  const { data: allAuditLogs } = useQuery({ queryKey: ['audit_logs'], queryFn: async () => { const { data } = await supabase.from('audit_logs').select('*'); return data || []; } });

  // Filter transactions if worker
  const allSales = useMemo(() => {
    if (!allSalesQuery) return undefined;
    if (currentUser?.role === 'worker') return allSalesQuery.filter(s => s.worker_id === currentUser.id);
    return allSalesQuery;
  }, [allSalesQuery, currentUser]);

  const allBookings = useMemo(() => {
    if (!allBookingsQuery) return undefined;
    if (currentUser?.role === 'worker') return allBookingsQuery.filter(b => b.worker_id === currentUser.id);
    return allBookingsQuery;
  }, [allBookingsQuery, currentUser]);

  // Ledger construction
  const rawLedger = useMemo(() => {
    if (!allSales || !allBookings || !allUsers || !allPlants || !allAuditLogs) return null;

    const userMap = new Map(allUsers.map(u => [u.id, u.name]));
    const plantMap = new Map(allPlants.map(p => [p.id, p.variety ? `${p.plant_name} - ${p.variety}` : p.plant_name]));
    const deliveryLogs = new Map(allAuditLogs.filter(l => l.action === 'DELIVER_BOOKING').map(l => [l.record_id, new Date(l.created_at).getTime()]));

    const ledger: any[] = [];

    // 1. Direct Sales
    const salesByNo: Record<string, typeof allSales> = {};
    for (const sale of allSales) {
      if (!salesByNo[sale.sale_number]) salesByNo[sale.sale_number] = [];
      salesByNo[sale.sale_number].push(sale);
    }

    for (const [saleNo, items] of Object.entries(salesByNo)) {
      const first = items[0];
      const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
      const plantNames = items.map(item => `${plantMap.get(item.plant_id) || 'Plant'} (x${item.quantity})`).join(', ');

      ledger.push({
        id: `ds_${saleNo}`,
        date: new Date(first.created_at).getTime(),
        title: `${t('Sale')} - ${first.customer_name || t('walkIn')} (${plantNames})`,
        customer: first.customer_name || 'Walk-in',
        amount: totalAmount,
        mode: first.payment_mode,
        cashAmount: first.cash_amount,
        upiAmount: first.upi_amount,
        worker: userMap.get(first.worker_id) || 'Unknown Worker',
        type: 'sale',
        ref: saleNo
      });
    }

    // 2. Bookings (Advance & Final)
    const bookingsByNo: Record<string, typeof allBookings> = {};
    for (const b of allBookings) {
      if (!bookingsByNo[b.booking_number]) bookingsByNo[b.booking_number] = [];
      bookingsByNo[b.booking_number].push(b);
    }

    for (const [bookingNo, items] of Object.entries(bookingsByNo)) {
      const first = items[0];
      const plantNames = items.map(item => `${plantMap.get(item.plant_id) || 'Plant'} (x${item.quantity})`).join(', ');

      const totalAdvance = items.reduce((sum, item) => sum + (item.advance_paid || 0), 0);
      if (totalAdvance > 0) {
        const dateStr = first.created_at || first.booking_date;
        let totalCash = 0, totalUpi = 0;
        items.forEach(item => {
          totalCash += item.advance_cash_amount || 0;
          totalUpi += item.advance_upi_amount || 0;
        });

        ledger.push({
          id: `adv_${bookingNo}`,
          date: new Date(dateStr).getTime(),
          title: `${t('Advance')} - ${first.customer_name || t('walkIn')} (${plantNames})`,
          customer: first.customer_name || 'Customer',
          amount: totalAdvance,
          mode: first.advance_payment_mode || 'Cash',
          cashAmount: totalCash > 0 ? totalCash : undefined,
          upiAmount: totalUpi > 0 ? totalUpi : undefined,
          worker: userMap.get(first.worker_id || '') || 'Unknown Worker',
          type: 'advance',
          ref: bookingNo
        });
      }

      const deliveredItems = items.filter(item => item.status === 'Delivered');
      if (deliveredItems.length > 0) {
        const totalBalance = deliveredItems.reduce((sum, item) => sum + Math.max(0, item.total_amount - (item.advance_paid || 0)), 0);
        if (totalBalance > 0) {
          let latestDeliveryTime = 0;
          deliveredItems.forEach(item => {
            const t = deliveryLogs.get(item.id) as number | undefined;
            if (t && t > latestDeliveryTime) latestDeliveryTime = t;
          });
          const exactTime = latestDeliveryTime || new Date(first.delivery_date || first.booking_date).setHours(12, 0, 0, 0);
          let totalCash = 0, totalUpi = 0;
          deliveredItems.forEach(item => {
            totalCash += item.cash_amount || 0;
            totalUpi += item.upi_amount || 0;
          });

          ledger.push({
            id: `final_${bookingNo}`,
            date: exactTime,
            title: `${t('Final Pay')} - ${first.customer_name || t('walkIn')} (${plantNames})`,
            customer: first.customer_name || 'Customer',
            amount: totalBalance,
            mode: first.payment_mode || 'Cash',
            cashAmount: totalCash > 0 ? totalCash : undefined,
            upiAmount: totalUpi > 0 ? totalUpi : undefined,
            worker: userMap.get(first.worker_id || '') || 'Unknown Worker',
            type: 'final',
            ref: bookingNo
          });
        }
      }
    }

    return ledger.sort((a, b) => b.date - a.date);
  }, [allSales, allBookings, allUsers, allPlants, allAuditLogs, t]);

  // Filtering
  const filteredLedger = useMemo(() => {
    if (!rawLedger) return [];
    return rawLedger.filter(item => {
      // Search
      const searchStr = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || 
        item.customer.toLowerCase().includes(searchStr) || 
        item.title.toLowerCase().includes(searchStr) || 
        item.ref.toLowerCase().includes(searchStr);

      // Mode
      const matchesMode = filterMode === 'All' || item.mode === filterMode;
      
      // Type
      const matchesType = filterType === 'All' || item.type === filterType;

      // Date Range
      const itemDateStr = toLocalDateStr(item.date);
      let matchesDate = true;
      if (dateRange.start && itemDateStr < dateRange.start) matchesDate = false;
      if (dateRange.end && itemDateStr > dateRange.end) matchesDate = false;

      return matchesSearch && matchesMode && matchesType && matchesDate;
    });
  }, [rawLedger, searchQuery, filterMode, filterType, dateRange]);

  // Totals calculation
  const totalAmount = filteredLedger.reduce((sum, i) => sum + i.amount, 0);
  const totalCash = filteredLedger.reduce((sum, i) => sum + (i.mode === 'Cash' ? i.amount : (i.mode === 'Split' ? (i.cashAmount || 0) : 0)), 0);
  const totalUpi = filteredLedger.reduce((sum, i) => sum + (i.mode === 'UPI' ? i.amount : (i.mode === 'Split' ? (i.upiAmount || 0) : 0)), 0);

  function fmt(n: number) { return '₹' + n.toLocaleString('en-IN'); }

  // Group by date
  const groupedLedger = useMemo(() => {
    const groups: Record<string, typeof filteredLedger> = {};
    filteredLedger.forEach(item => {
      const d = new Date(item.date);
      d.setHours(0, 0, 0, 0);
      const dateKey = d.getTime().toString();
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    });
    
    return Object.entries(groups)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([timestamp, items]) => {
        const d = new Date(Number(timestamp));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        let label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        if (d.getTime() === today.getTime()) label = 'Today';
        else if (d.getTime() === yesterday.getTime()) label = 'Yesterday';
        
        return { label, items };
      });
  }, [filteredLedger]);

  if (!rawLedger) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10 flex items-center gap-3 shadow-sm">
        <Link href="/" className="p-2 -ml-2 rounded-xl text-gray-500 bg-gray-100 active:scale-95 transition-transform">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-black tracking-tight text-gray-900">Transactions</h1>
          <p className="text-xs font-semibold text-gray-500">{filteredLedger.length} Records</p>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Filters Box */}
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search customer or ref..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-10 pr-4 text-sm font-medium focus:ring-2 focus:ring-green-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Start Date</label>
              <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 px-3 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">End Date</label>
              <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 px-3 text-sm" />
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {['All', 'Cash', 'UPI', 'Split'].map(m => (
              <button 
                key={m} 
                onClick={() => setFilterMode(m as any)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${filterMode === m ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {['All', 'sale', 'advance', 'final'].map(tStr => (
              <button 
                key={tStr} 
                onClick={() => setFilterType(tStr as any)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors capitalize ${filterType === tStr ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {tStr === 'final' ? 'Final Pay' : tStr}
              </button>
            ))}
          </div>
        </div>

        {/* Aggregates */}
        <div className="bg-gradient-to-br from-green-600 to-emerald-800 rounded-2xl p-5 text-white shadow-md relative overflow-hidden">
          <div className="absolute -right-8 -top-8 bg-white opacity-10 w-32 h-32 rounded-full" />
          <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">Filtered Total</p>
          <p className="text-4xl font-black">{fmt(totalAmount)}</p>
          <div className="flex gap-6 mt-4">
            <div>
              <p className="text-[10px] uppercase opacity-70 font-bold mb-0.5">Cash</p>
              <p className="font-black text-lg">{fmt(totalCash)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase opacity-70 font-bold mb-0.5">UPI</p>
              <p className="font-black text-lg">{fmt(totalUpi)}</p>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="space-y-4">
          {groupedLedger.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 font-medium text-sm">No transactions found</div>
          ) : (
            groupedLedger.map(group => (
              <div key={group.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
                  <p className="text-xs font-black text-gray-600 uppercase tracking-widest">{group.label}</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {group.items.map((item) => (
                    <div key={item.id} className="p-4 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                        item.type === 'sale' ? 'bg-purple-100 text-purple-600' :
                        item.type === 'advance' ? 'bg-blue-100 text-blue-600' :
                        'bg-emerald-100 text-emerald-600'
                      }`}>
                        {item.type === 'sale' ? <ShoppingCart className="w-5 h-5" /> : 
                         item.type === 'advance' ? <BookOpen className="w-5 h-5" /> : 
                         <Truck className="w-5 h-5" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <p className="font-black text-gray-900 text-sm truncate pr-2">{item.title}</p>
                          <p className="font-black text-gray-900">{fmt(item.amount)}</p>
                        </div>
                        
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md ${
                              item.mode === 'Cash' ? 'bg-green-100 text-green-700' :
                              item.mode === 'UPI' ? 'bg-purple-100 text-purple-700' :
                              'bg-orange-100 text-orange-700'
                            }`}>
                              {item.mode}
                            </span>
                            {item.mode === 'Split' && (
                              <span className="text-[10px] font-bold text-gray-500">
                                (C: {item.cashAmount} / U: {item.upiAmount})
                              </span>
                            )}
                            <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-md flex items-center gap-1">
                              👤 {item.worker}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-gray-400">
                            {new Date(item.date).toLocaleString('en-IN', { hour: 'numeric', minute: 'numeric', hour12: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
