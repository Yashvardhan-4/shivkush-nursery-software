'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toLocalDateStr } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  Banknote,
  AlertTriangle,
  CheckCircle2,
  Sprout,
  ClipboardList,
  BarChart3,
  ShoppingCart,
  BookOpen,
  Truck,
  CalendarDays,
  Receipt,
} from 'lucide-react';

type Tab = 'reconciliation' | 'production' | 'workers';

interface CashbookItem {
  datetime: string;
  transaction_type: 'BOOKING_PAYMENT' | 'DIRECT_SALE' | 'EXPENSE';
  cash: number;
  upi: number;
  total: number;
  description: string;
}

interface InventoryStatusRow {
  plant_id: string;
  plant_name: string;
  variety: string;
  category: string;
  current_physical_stock: number;
  allocated_quantity: number;
  free_stock: number;
  selling_price: number;
  active: boolean;
}

interface UserItem {
  id: string;
  name: string;
  role: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  return '₹' + (n || 0).toLocaleString('en-IN');
}
function todayIST() {
  return toLocalDateStr();
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ─── Tab Button ───────────────────────────────────────────────────────────────
function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
        active
          ? 'bg-white text-green-700 shadow-sm'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Payment Badge ────────────────────────────────────────────────────────────
function PaymentBadge({
  cashAmt,
  upiAmt,
}: {
  cashAmt?: number;
  upiAmt?: number;
}) {
  const c = Number(cashAmt) || 0;
  const u = Number(upiAmt) || 0;

  if (c > 0 && u > 0) {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 whitespace-nowrap">
        💵 ₹{c} + 📱 ₹{u}
      </span>
    );
  }
  if (u > 0) {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">
        📱 UPI ₹{u}
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap">
      💵 CASH ₹{c}
    </span>
  );
}

// ─── Event Type Pill ──────────────────────────────────────────────────────────
function EventTypePill({ type }: { type: 'BOOKING_PAYMENT' | 'DIRECT_SALE' | 'EXPENSE' }) {
  const styles = {
    DIRECT_SALE: 'bg-sky-100 text-sky-700',
    BOOKING_PAYMENT: 'bg-violet-100 text-violet-700',
    EXPENSE: 'bg-red-100 text-red-700',
  };
  const labels = {
    DIRECT_SALE: 'SALE',
    BOOKING_PAYMENT: 'BOOKING',
    EXPENSE: 'EXPENSE',
  };
  return (
    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${styles[type]}`}>
      {labels[type]}
    </span>
  );
}

// ─── Event Icon ───────────────────────────────────────────────────────────────
function EventIcon({ type }: { type: 'BOOKING_PAYMENT' | 'DIRECT_SALE' | 'EXPENSE' }) {
  if (type === 'DIRECT_SALE') {
    return (
      <div className="w-10 h-10 rounded-2xl bg-sky-100 flex items-center justify-center shrink-0">
        <ShoppingCart className="w-5 h-5 text-sky-600" />
      </div>
    );
  }
  if (type === 'EXPENSE') {
    return (
      <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
        <Receipt className="w-5 h-5 text-red-600" />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
      <BookOpen className="w-5 h-5 text-violet-600" />
    </div>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────
function LoadingCard() {
  return (
    <div className="p-8 text-center text-gray-400 text-sm font-medium animate-pulse">
      Loading data…
    </div>
  );
}

// ─── RECONCILIATION TAB ───────────────────────────────────────────────────────
function ReconciliationTab() {
  const { t } = useLanguage();
  const [selectedDate, setSelectedDate] = useState(todayIST());

  const dayStart = `${selectedDate}T00:00:00+05:30`;
  const dayEnd = `${selectedDate}T23:59:59.999+05:30`;

  const { data: cashbookRows, isLoading } = useQuery<CashbookItem[]>({
    queryKey: ['vw_daily_cashbook', selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_daily_cashbook')
        .select('datetime, transaction_type, cash, upi, total, description')
        .gte('datetime', dayStart)
        .lte('datetime', dayEnd)
        .order('datetime', { ascending: false });
      if (error) throw error;
      return (data as CashbookItem[]) || [];
    },
  });

  if (isLoading || !cashbookRows) {
    return <LoadingCard />;
  }

  let cashInflow = 0;
  let upiInflow = 0;
  let totalRevenue = 0;

  let totalExpenses = 0;

  for (const r of cashbookRows) {
    if (r.transaction_type === 'EXPENSE') {
      totalExpenses += Math.abs(Number(r.total) || 0);
    } else {
      cashInflow += Number(r.cash) || 0;
      upiInflow += Number(r.upi) || 0;
      totalRevenue += Number(r.total) || 0;
    }
  }

  const netCollections = totalRevenue - totalExpenses;

  return (
    <div className="space-y-4">
      {/* Date Picker Header */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-green-600" />
          <h3 className="font-bold text-gray-700 text-sm">{t('selectDate')}</h3>
        </div>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {/* Grand Total Hero */}
      <div className="bg-gradient-to-br from-green-600 to-emerald-800 rounded-3xl p-7 text-white relative overflow-hidden shadow-lg">
        <div className="absolute -right-8 -top-8 bg-white opacity-10 w-36 h-36 rounded-full" />
        <div className="absolute -left-6 -bottom-6 bg-white opacity-5 w-28 h-28 rounded-full" />
        <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-2">
          Total Revenue
        </p>
        <p className="text-5xl font-black tracking-tight">{fmt(totalRevenue)}</p>
        <p className="text-xs opacity-70 mt-2">Net Cashbook Balance: {fmt(netCollections)} · {selectedDate}</p>
      </div>

      {/* Cash / UPI split */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="bg-green-600 p-2 rounded-xl">
              <Banknote className="w-4 h-4 text-white" />
            </div>
            <span className="text-xs font-bold text-green-800 uppercase tracking-wide">
              {t('cash')}
            </span>
          </div>
          <p className="text-3xl font-black text-green-700">{fmt(cashInflow)}</p>
        </div>

        <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="bg-purple-600 p-2 rounded-xl">
              <Banknote className="w-4 h-4 text-white" />
            </div>
            <span className="text-xs font-bold text-purple-800 uppercase tracking-wide">
              {t('upi')}
            </span>
          </div>
          <p className="text-3xl font-black text-purple-700">{fmt(upiInflow)}</p>
        </div>
      </div>

      {/* Collections List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-gray-400" />
          <h3 className="font-bold text-gray-700 text-sm">
            {t('collections')} ({cashbookRows.length})
          </h3>
        </div>

        {cashbookRows.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm font-medium">
            {t('noCollectionsRecorded').replace('{date}', selectedDate)}
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {cashbookRows.map((ev, idx) => (
              <li key={idx} className="px-4 py-4">
                <div className="flex items-start gap-3">
                  <EventIcon type={ev.transaction_type} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-black text-gray-900 text-sm truncate">
                        {ev.description}
                      </p>
                      <EventTypePill type={ev.transaction_type} />
                    </div>

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[10px] font-bold text-gray-400">
                        {fmtTime(ev.datetime)}
                      </span>
                      <span className="text-gray-300">·</span>
                      <PaymentBadge
                        cashAmt={ev.cash}
                        upiAmt={ev.upi}
                      />
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className={`font-black text-sm ${ev.transaction_type === 'EXPENSE' ? 'text-red-600' : 'text-gray-900'}`}>
                      {ev.transaction_type === 'EXPENSE' ? `-${fmt(Math.abs(ev.total))}` : fmt(ev.total)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── PRODUCTION DEMAND TAB ────────────────────────────────────────────────────
function ProductionDemandTab() {
  const { t } = useLanguage();
  const { data: inventory, isLoading } = useQuery<InventoryStatusRow[]>({
    queryKey: ['vw_inventory_status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_inventory_status')
        .select('*')
        .eq('active', true);
      if (error) throw error;
      return (data as InventoryStatusRow[]) || [];
    },
  });

  if (isLoading || !inventory) {
    return <LoadingCard />;
  }

  type PlantDemand = {
    id: string;
    name: string;
    variety: string;
    totalBooked: number;
    physicalStock: number;
    freeStock: number;
    deficit: number;
  };

  const demands: PlantDemand[] = inventory.map((plant) => {
    const totalBooked = Number(plant.allocated_quantity) || 0;
    const physicalStock = Number(plant.current_physical_stock) || 0;
    const freeStock = Number(plant.free_stock) || 0;
    const deficit = Math.max(0, totalBooked - physicalStock);

    return {
      id: plant.plant_id,
      name: plant.plant_name,
      variety: plant.variety,
      totalBooked,
      physicalStock,
      freeStock,
      deficit,
    };
  });

  // Sort: deficit plants first
  const sorted = [...demands].sort((a, b) => b.deficit - a.deficit);
  const alertCount = sorted.filter((d) => d.deficit > 0).length;

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      {alertCount > 0 ? (
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl px-5 py-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm font-bold text-red-700">
            {alertCount} {t('needMoreProduction')}
          </p>
        </div>
      ) : (
        <div className="bg-green-50 border-2 border-green-200 rounded-2xl px-5 py-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <p className="text-sm font-bold text-green-700">
            {t('allStockSufficient')}
          </p>
        </div>
      )}

      {/* Per-plant cards */}
      {sorted.map((d) => (
        <div
          key={d.id}
          className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
            d.deficit > 0 ? 'border-red-200' : 'border-gray-100'
          }`}
        >
          <div className="px-5 py-4 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Sprout
                  className={`w-4 h-4 shrink-0 ${
                    d.deficit > 0 ? 'text-red-400' : 'text-green-500'
                  }`}
                />
                <h3 className="font-black text-gray-900 text-sm truncate">
                  {d.name}
                </h3>
                <span className="text-xs text-gray-400 font-medium">
                  ({d.variety})
                </span>
              </div>
              <div className="flex gap-4 mt-3">
                <div className="text-center">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                    Physical Stock
                  </p>
                  <p className="text-2xl font-black text-gray-800">
                    {d.physicalStock}
                  </p>
                </div>
                <div className="text-gray-200 self-stretch border-l" />
                <div className="text-center">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                    Booked
                  </p>
                  <p className="text-2xl font-black text-blue-600">
                    {d.totalBooked}
                  </p>
                </div>
                <div className="text-gray-200 self-stretch border-l" />
                <div className="text-center">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                    Free to Sell
                  </p>
                  <p className={`text-2xl font-black ${d.freeStock >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {d.freeStock}
                  </p>
                </div>
              </div>
            </div>

            {/* Badge */}
            <div className="shrink-0">
              {d.deficit > 0 ? (
                <span className="inline-block bg-red-100 text-red-700 border border-red-300 text-xs font-black px-3 py-2 rounded-xl leading-tight text-center">
                  ⚠️ {t('needToGrow')}
                  <br />
                  <span className="text-lg">{d.deficit}</span> {t('qty').toLowerCase()}
                </span>
              ) : (
                <span className="inline-block bg-green-100 text-green-700 border border-green-300 text-xs font-black px-3 py-2 rounded-xl text-center leading-tight">
                  ✅ {t('stockOk')}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}

      {inventory.length === 0 && (
        <div className="p-8 text-center text-gray-400 text-sm font-medium bg-white rounded-2xl border border-gray-100">
          {t('noActivePlants')}
        </div>
      )}
    </div>
  );
}

// ─── Workers Report Tab ───────────────────────────────────────────────────────
function WorkersTab() {
  const [selectedDate, setSelectedDate] = useState(todayIST());
  const [selectedWorker, setSelectedWorker] = useState<string>('all');

  const { data: allTransactionsRaw } = useQuery<any[]>({ queryKey: ['transactions'], queryFn: async () => { const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false }); return (data as any[]) || []; } });
  const { data: usersRaw } = useQuery<UserItem[]>({ queryKey: ['users'], queryFn: async () => { const { data } = await supabase.from('users').select('id, name, role'); return (data as UserItem[]) || []; } });

  if (!allTransactionsRaw || !usersRaw) return <LoadingCard />;

  const workers = usersRaw;

  const getWorkerStats = (workerId: string, dateStr: string | null) => {
    const txs = allTransactionsRaw.filter(t => 
      t.worker_id === workerId && 
      (!dateStr || toLocalDateStr(t.created_at) === dateStr)
    );

    let salesCash = 0, salesUpi = 0;
    let advCash = 0, advUpi = 0;
    let delCash = 0, delUpi = 0;
    
    let saleCount = 0;
    let advanceCount = 0;
    let deliveryCount = 0;

    txs.forEach(t => {
      const isSplit = t.payment_mode === 'Split';
      const c = isSplit ? (t.cash_amount || 0) : (t.payment_mode === 'Cash' ? t.amount : 0);
      const u = isSplit ? (t.upi_amount || 0) : (t.payment_mode === 'UPI' ? t.amount : 0);

      if (t.reference_type === 'DIRECT_SALE') {
        salesCash += c; salesUpi += u; saleCount++;
      } else if (t.reference_type === 'BOOKING_ADVANCE') {
        advCash += c; advUpi += u; advanceCount++;
      } else if (t.reference_type === 'BOOKING_DELIVERY') {
        delCash += c; delUpi += u; deliveryCount++;
      }
    });

    const totalCash = salesCash + advCash + delCash;
    const totalUpi = salesUpi + advUpi + delUpi;

    return {
      saleCount, advanceCount, deliveryCount,
      salesCash, salesUpi, advCash, advUpi, delCash, delUpi,
      totalCash, totalUpi,
      total: totalCash + totalUpi,
    };
  };

  const txList: any[] = [];
  if (selectedWorker !== 'all') {
    const txs = allTransactionsRaw.filter(t => 
      t.worker_id === selectedWorker && 
      (!selectedDate || toLocalDateStr(t.created_at) === selectedDate)
    );

    txs.forEach(t => {
      let label = 'Direct Sale';
      if (t.reference_type === 'BOOKING_ADVANCE') label = 'Advance';
      else if (t.reference_type === 'BOOKING_DELIVERY') label = 'Final Payment';

      txList.push({
        id: t.id,
        label,
        plant: t.plant_names || 'Unknown',
        customer: t.customer_name || 'Walk-in',
        amount: t.amount,
        cash: t.payment_mode === 'Split' ? (t.cash_amount || 0) : (t.payment_mode === 'Cash' ? t.amount : 0),
        upi: t.payment_mode === 'Split' ? (t.upi_amount || 0) : (t.payment_mode === 'UPI' ? t.amount : 0),
        mode: t.payment_mode || 'Cash',
        time: new Date(t.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }),
      });
    });
  }

  const overallStats = selectedWorker !== 'all' ? getWorkerStats(selectedWorker, selectedDate) : null;

  return (
    <div className="space-y-4">
      {/* Date Picker */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
        <CalendarDays className="w-5 h-5 text-gray-400 shrink-0" />
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="flex-1 text-sm font-bold text-gray-800 bg-transparent outline-none"
        />
        <button onClick={() => setSelectedDate('')} className="text-xs font-bold text-gray-400 underline">All Dates</button>
      </div>

      {/* Worker Selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedWorker('all')}
          className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
            selectedWorker === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          All Workers
        </button>
        {workers.map(w => (
          <button
            key={w.id}
            onClick={() => setSelectedWorker(w.id)}
            className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
              selectedWorker === w.id ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {w.name} {w.role === 'owner' ? '(Owner)' : ''}
          </button>
        ))}
      </div>

      {/* All Workers Summary */}
      {selectedWorker === 'all' && (
        <div className="space-y-3">
          {workers.map(w => {
            const s = getWorkerStats(w.id, selectedDate || null);
            if (s.total === 0) return null;
            return (
              <div
                key={w.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3 cursor-pointer active:scale-95 transition-transform"
                onClick={() => setSelectedWorker(w.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-black text-gray-900 text-base">{w.name}</p>
                    <p className="text-xs font-semibold text-gray-400 capitalize">{w.role}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-green-600">{fmt(s.total)}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Collected</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-sky-50 rounded-xl p-2 text-center">
                    <p className="text-[10px] font-bold text-sky-600 uppercase">Sales</p>
                    <p className="font-black text-sky-700">{s.saleCount}</p>
                  </div>
                  <div className="bg-violet-50 rounded-xl p-2 text-center">
                    <p className="text-[10px] font-bold text-violet-600 uppercase">Advances</p>
                    <p className="font-black text-violet-700">{s.advanceCount}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-2 text-center">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase">Deliveries</p>
                    <p className="font-black text-emerald-700">{s.deliveryCount}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1 bg-green-50 rounded-xl p-2 text-center">
                    <p className="text-[10px] font-bold text-green-600 uppercase">Cash</p>
                    <p className="font-black text-green-700">{fmt(s.totalCash)}</p>
                  </div>
                  <div className="flex-1 bg-blue-50 rounded-xl p-2 text-center">
                    <p className="text-[10px] font-bold text-blue-600 uppercase">UPI</p>
                    <p className="font-black text-blue-700">{fmt(s.totalUpi)}</p>
                  </div>
                </div>
              </div>
            );
          })}
          {workers.every(w => getWorkerStats(w.id, selectedDate || null).total === 0) && (
            <div className="p-8 text-center text-gray-400 text-sm font-medium bg-white rounded-2xl border border-gray-100">
              No transactions {selectedDate ? `on ${new Date(selectedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}` : 'found'}
            </div>
          )}
        </div>
      )}

      {/* Single Worker Detail */}
      {selectedWorker !== 'all' && overallStats && (
        <div className="space-y-3">
          {/* Summary card */}
          <div className="bg-gradient-to-br from-green-600 to-emerald-800 rounded-2xl p-5 text-white shadow-md">
            <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">
              {workers.find(w => w.id === selectedWorker)?.name}&apos;s Collection
            </p>
            <p className="text-4xl font-black">{fmt(overallStats.total)}</p>
            <div className="flex gap-6 mt-3">
              <div><p className="text-[10px] uppercase opacity-70 font-bold mb-0.5">Cash</p><p className="font-black text-lg">{fmt(overallStats.totalCash)}</p></div>
              <div><p className="text-[10px] uppercase opacity-70 font-bold mb-0.5">UPI</p><p className="font-black text-lg">{fmt(overallStats.totalUpi)}</p></div>
            </div>
            <div className="flex gap-4 mt-3">
              <span className="text-xs font-bold opacity-80">{overallStats.saleCount} sales</span>
              <span className="text-xs font-bold opacity-80">{overallStats.advanceCount} advances</span>
              <span className="text-xs font-bold opacity-80">{overallStats.deliveryCount} deliveries</span>
            </div>
          </div>

          {/* Transaction list */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {txList.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm font-medium">No transactions found</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {txList.map(tx => (
                  <div key={tx.id} className="p-4 flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 text-xs font-black ${
                      tx.label === 'Direct Sale' ? 'bg-sky-100 text-sky-600' :
                      tx.label === 'Advance' ? 'bg-violet-100 text-violet-600' :
                      'bg-emerald-100 text-emerald-600'
                    }`}>
                      {tx.label === 'Direct Sale' ? <ShoppingCart className="w-4 h-4" /> : tx.label === 'Advance' ? <BookOpen className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-black text-gray-900">{tx.label}</p>
                          <p className="text-[11px] font-semibold text-gray-500">{tx.customer} · {tx.plant}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-gray-900">{fmt(tx.amount)}</p>
                          <p className="text-[10px] text-gray-400">{tx.time}</p>
                        </div>
                      </div>
                      <div className="mt-1">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          tx.mode === 'Cash' ? 'bg-green-100 text-green-700' :
                          tx.mode === 'UPI' ? 'bg-blue-100 text-blue-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>{tx.mode}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function ReportsDashboard() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>('reconciliation');

  return (
    <div className="space-y-4">
      {/* Tab Bar */}
      <div className="bg-gray-100 p-1 rounded-2xl flex gap-1 sticky top-0 z-10 shadow-sm">
        <TabBtn
          active={activeTab === 'reconciliation'}
          onClick={() => setActiveTab('reconciliation')}
        >
          <div className="flex flex-col items-center gap-0.5">
            <Banknote className="w-4 h-4" />
            {t('collections')}
          </div>
        </TabBtn>
        <TabBtn
          active={activeTab === 'production'}
          onClick={() => setActiveTab('production')}
        >
          <div className="flex flex-col items-center gap-0.5">
            <BarChart3 className="w-4 h-4" />
            {t('productionAlerts')}
          </div>
        </TabBtn>
        <TabBtn
          active={activeTab === 'workers'}
          onClick={() => setActiveTab('workers')}
        >
          <div className="flex flex-col items-center gap-0.5">
            <ClipboardList className="w-4 h-4" />
            Workers
          </div>
        </TabBtn>
      </div>

      {/* Tab Content */}
      {activeTab === 'reconciliation' && <ReconciliationTab />}
      {activeTab === 'production' && <ProductionDemandTab />}
      {activeTab === 'workers' && <WorkersTab />}
    </div>
  );
}
