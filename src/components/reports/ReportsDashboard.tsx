// @ts-nocheck
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toLocalDateStr } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import {
  Banknote,
  Smartphone,
  AlertTriangle,
  CheckCircle2,
  Sprout,
  ClipboardList,
  BarChart3,
  Layers,
  ShoppingCart,
  BookOpen,
  Truck,
  CalendarDays,
} from 'lucide-react';

type Tab = 'reconciliation' | 'production' | 'lots' | 'workers';

// ─── helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  return '₹' + (n || 0).toLocaleString('en-IN');
}
function todayIST() {
  return toLocalDateStr();
}
function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-IN', {
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
  mode,
  cashAmt,
  upiAmt,
}: {
  mode: string;
  cashAmt?: number;
  upiAmt?: number;
}) {
  if (mode === 'Split') {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 whitespace-nowrap">
        💵 ₹{cashAmt ?? 0} + 📱 ₹{upiAmt ?? 0}
      </span>
    );
  }
  if (mode === 'UPI') {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">
        📱 UPI
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap">
      💵 CASH
    </span>
  );
}

// ─── Event Type Pill ──────────────────────────────────────────────────────────
function EventTypePill({ type }: { type: 'Direct Sale' | 'Booking Delivery' | 'Booking Advance' }) {
  const styles = {
    'Direct Sale': 'bg-sky-100 text-sky-700',
    'Booking Delivery': 'bg-emerald-100 text-emerald-700',
    'Booking Advance': 'bg-violet-100 text-violet-700',
  };
  const labels = {
    'Direct Sale': 'SALE',
    'Booking Delivery': 'DELIVERY',
    'Booking Advance': 'ADVANCE',
  };
  return (
    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${styles[type]}`}>
      {labels[type]}
    </span>
  );
}

// ─── Event Icon ───────────────────────────────────────────────────────────────
function EventIcon({ type }: { type: 'Direct Sale' | 'Booking Delivery' | 'Booking Advance' }) {
  if (type === 'Direct Sale') {
    return (
      <div className="w-10 h-10 rounded-2xl bg-sky-100 flex items-center justify-center shrink-0">
        <ShoppingCart className="w-5 h-5 text-sky-600" />
      </div>
    );
  }
  if (type === 'Booking Delivery') {
    return (
      <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
        <Truck className="w-5 h-5 text-emerald-600" />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
      <BookOpen className="w-5 h-5 text-violet-600" />
    </div>
  );
}

// ─── RECONCILIATION TAB ───────────────────────────────────────────────────────
function ReconciliationTab() {
  const { t } = useLanguage();
  const [selectedDate, setSelectedDate] = useState(todayIST());
  const todayStr = selectedDate;

  const { data: allTransactionsRaw } = useQuery({ queryKey: ['transactions'], queryFn: async () => { const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false }); return data || []; } });
  const { data: usersRaw } = useQuery({ queryKey: ['users'], queryFn: async () => { const { data } = await supabase.from('users').select('id, name'); return data || []; } });

  if (!allTransactionsRaw || !usersRaw) {
    return <LoadingCard />;
  }

  const allTransactions = allTransactionsRaw.filter(t => toLocalDateStr(t.created_at) === selectedDate);
  const userMap = new Map(usersRaw.map((u) => [u.id, u.name]));

  let cashTotal = 0;
  let upiTotal = 0;

  type CollectionEvent = {
    id: string;
    type: 'Direct Sale' | 'Booking Delivery' | 'Booking Advance' | 'Booking Refund';
    plant_name: string;
    customer_name: string;
    quantity: number;
    amount: number;
    payment_mode: string;
    cash_amount?: number;
    upi_amount?: number;
    timestamp: number;
    order_number: string;
    worker_name: string;
  };

  const collectionEvents: CollectionEvent[] = [];

  for (const t of allTransactions) {
    if (t.payment_mode === 'Cash') cashTotal += t.amount;
    else if (t.payment_mode === 'UPI') upiTotal += t.amount;
    else if (t.payment_mode === 'Split') {
      cashTotal += t.cash_amount || 0;
      upiTotal += t.upi_amount || 0;
    }

    let type: CollectionEvent['type'] = 'Direct Sale';
    if (t.reference_type === 'BOOKING_ADVANCE') type = 'Booking Advance';
    else if (t.reference_type === 'BOOKING_DELIVERY') type = 'Booking Delivery';

    collectionEvents.push({
      id: t.id,
      type,
      plant_name: t.plant_names || 'Unknown',
      customer_name: t.customer_name || 'Walk-in',
      quantity: 0, // Not stored in transactions directly, UI can omit or show -
      amount: t.amount,
      payment_mode: t.payment_mode || 'Cash',
      cash_amount: t.cash_amount || 0,
      upi_amount: t.upi_amount || 0,
      timestamp: new Date(t.created_at).getTime(),
      order_number: t.booking_number || 'N/A',
      worker_name: userMap.get(t.worker_id) || 'Unknown Worker',
    });
  }

  const grandTotal = cashTotal + upiTotal;

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
          {t('grandTotal')}
        </p>
        <p className="text-5xl font-black tracking-tight">{fmt(grandTotal)}</p>
        <p className="text-xs opacity-70 mt-2">{t('collections')} · {todayStr}</p>
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
          <p className="text-3xl font-black text-green-700">{fmt(cashTotal)}</p>
        </div>
        <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="bg-purple-600 p-2 rounded-xl">
              <Smartphone className="w-4 h-4 text-white" />
            </div>
            <span className="text-xs font-bold text-purple-800 uppercase tracking-wide">
              {t('upi')}
            </span>
          </div>
          <p className="text-3xl font-black text-purple-700">{fmt(upiTotal)}</p>
        </div>
      </div>

      {/* Collections List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-gray-400" />
          <h3 className="font-bold text-gray-700 text-sm">
            {t('collections')} ({collectionEvents.length})
          </h3>
        </div>

        {collectionEvents.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm font-medium">
            {t('noCollectionsRecorded').replace('{date}', todayStr)}
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {collectionEvents.map((ev) => (
              <li key={ev.id} className="px-4 py-4">
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <EventIcon type={ev.type} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Row 1: Customer name + type pill */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-black text-gray-900 text-sm truncate">
                        {ev.customer_name}
                      </p>
                      <EventTypePill type={ev.type} />
                    </div>

                    {/* Row 2: Plants list */}
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed truncate">
                      {ev.plant_name}
                    </p>

                    {/* Row 3: Time + qty + payment badge */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[10px] font-bold text-gray-400">
                        {fmtTime(ev.timestamp)}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {t('qty')}: {ev.quantity}
                      </span>
                      <span className="text-gray-300">·</span>
                      <PaymentBadge
                        mode={ev.payment_mode}
                        cashAmt={ev.cash_amount}
                        upiAmt={ev.upi_amount}
                      />
                      <span className="text-gray-300">·</span>
                      <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                        👤 {ev.worker_name}
                      </span>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="shrink-0 text-right">
                    <p className="font-black text-gray-900 text-sm">{fmt(ev.amount)}</p>
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
  const { data: plants } = useQuery({ queryKey: ['plants'], queryFn: async () => { const { data } = await supabase.from('plants').select('*').is('deleted_at', null).eq('active', true); return data || []; } });
  const { data: bookings } = useQuery({ queryKey: ['bookings'], queryFn: async () => { const { data } = await supabase.from('bookings').select('*').is('deleted_at', null); return data || []; } });
  const { data: lots } = useQuery({ queryKey: ['lots'], queryFn: async () => { const { data } = await supabase.from('lots').select('*').is('deleted_at', null); return data || []; } });
  const { data: allotments } = useQuery({ queryKey: ['allotments'], queryFn: async () => { const { data } = await supabase.from('allotments').select('*').is('deleted_at', null); return data || []; } });

  if (!plants || !bookings || !lots || !allotments) {
    return <LoadingCard />;
  }

  type PlantDemand = {
    id: string;
    name: string;
    variety: string;
    totalBooked: number;
    totalGrowing: number;
    deficit: number;
  };

  const demands: PlantDemand[] = plants.map((plant) => {
    const activeBookings = bookings.filter(
      (b) =>
        b.plant_id === plant.id &&
        b.status !== 'Cancelled' &&
        b.status !== 'Delivered'
    );

    const rawTotalBooked = activeBookings.reduce((sum, b) => sum + b.quantity, 0);

    const activeBookingIds = new Set(activeBookings.map(b => b.id));
    const allottedToBookings = allotments
      .filter(a => activeBookingIds.has(a.booking_id))
      .reduce((sum, a) => sum + a.quantity, 0);

    const totalBooked = Math.max(0, rawTotalBooked - allottedToBookings);

    const activeLots = new Set(lots.filter(l => l.plant_id === plant.id && l.status !== 'Completed').map(l => l.id));

    const deliveredQty = bookings
      .filter(b => b.plant_id === plant.id && b.status === 'Delivered' && activeLots.has(b.lot_id))
      .reduce((sum, b) => sum + b.quantity, 0);

    const soldQty = direct_sales
      .filter(s => s.plant_id === plant.id && activeLots.has(s.lot_id))
      .reduce((sum, s) => sum + s.quantity, 0);

    const totalStock = lots
      .filter((l) => l.plant_id === plant.id && l.status !== 'Completed')
      .reduce((sum, l) => sum + (l.available_stock ?? l.total_quantity), 0);

    const totalGrowing = Math.max(0, totalStock - allottedToBookings - deliveredQty - soldQty);

    const deficit = Math.max(0, totalBooked - totalGrowing);

    return {
      id: plant.id,
      name: plant.plant_name,
      variety: plant.variety,
      totalBooked,
      totalGrowing,
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
                    {t('bookedUnallotted')}
                  </p>
                  <p className="text-2xl font-black text-blue-600">
                    {d.totalBooked}
                  </p>
                </div>
                <div className="text-gray-200 self-stretch border-l" />
                <div className="text-center">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                    {t('stockFree')}
                  </p>
                  <p className="text-2xl font-black text-emerald-600">
                    {d.totalGrowing}
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

      {plants.length === 0 && (
        <div className="p-8 text-center text-gray-400 text-sm font-medium bg-white rounded-2xl border border-gray-100">
          {t('noActivePlants')}
        </div>
      )}
    </div>
  );
}

// ─── LOT REPORT TAB ───────────────────────────────────────────────────────────
function LotReportTab() {
  const { t } = useLanguage();
  const { data: lots } = useQuery({ queryKey: ['lots'], queryFn: async () => { const { data } = await supabase.from('lots').select('*').is('deleted_at', null); return data || []; } });
  const { data: plants } = useQuery({ queryKey: ['plants'], queryFn: async () => { const { data } = await supabase.from('plants').select('*').is('deleted_at', null).eq('active', true); return data || []; } });
  const { data: allotments } = useQuery({ queryKey: ['allotments'], queryFn: async () => { const { data } = await supabase.from('allotments').select('*').is('deleted_at', null); return data || []; } });
  const { data: bookings } = useQuery({ queryKey: ['bookings'], queryFn: async () => { const { data } = await supabase.from('bookings').select('*').is('deleted_at', null); return data || []; } });
  const { data: directSales } = useQuery({ queryKey: ['direct_sales'], queryFn: async () => { const { data } = await supabase.from('direct_sales').select('*').is('deleted_at', null); return data || []; } });

  if (!lots || !plants || !allotments || !bookings || !directSales) {
    return <LoadingCard />;
  }

  const plantMap = new Map(plants.map((p) => [p.id, p]));

  const activeBookingIds = new Set(
    bookings.filter(b => b.status !== 'Delivered' && b.status !== 'Cancelled').map(b => b.id)
  );

  // Build allotted qty per lot
  const allottedPerLot = new Map<string, number>();
  for (const a of allotments) {
    if (activeBookingIds.has(a.booking_id)) {
      allottedPerLot.set(a.lot_id, (allottedPerLot.get(a.lot_id) ?? 0) + a.quantity);
    }
  }

  const statusGroups: Array<{
    status: 'Growing' | 'Ready' | 'Completed';
    labelKey: keyof ReturnType<typeof useLanguage>['t'] extends never ? string : string;
    color: string;
    dotColor: string;
  }> = [
    { status: 'Ready', labelKey: 'readyToDeliver', color: 'text-emerald-700', dotColor: 'bg-emerald-500' },
    { status: 'Growing', labelKey: 'currentlyGrowing', color: 'text-blue-700', dotColor: 'bg-blue-500' },
    { status: 'Completed', labelKey: 'completed', color: 'text-gray-500', dotColor: 'bg-gray-400' },
  ];

  return (
    <div className="space-y-6">
      {statusGroups.map((group) => {
        const groupLots = lots.filter((l) => l.status === group.status);
        if (groupLots.length === 0) return null;

        return (
          <div key={group.status}>
            {/* Group heading */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className={`w-2.5 h-2.5 rounded-full ${group.dotColor}`} />
              <h3 className={`text-sm font-black uppercase tracking-wider ${group.color}`}>
                {t(group.labelKey as any)}
                <span className="ml-2 text-gray-400 font-semibold">
                  ({groupLots.length})
                </span>
              </h3>
            </div>

            <div className="space-y-3">
              {groupLots.map((lot) => {
                const plant = plantMap.get(lot.plant_id);
                const allottedQty = allottedPerLot.get(lot.id) ?? 0;
                const deliveredQty = bookings
                  .filter(b => b.lot_id === lot.id && b.status === 'Delivered')
                  .reduce((sum, b) => sum + b.quantity, 0);
                const directSoldQty = directSales
                  .filter(s => s.lot_id === lot.id)
                  .reduce((sum, s) => sum + s.quantity, 0);
                const soldQty = deliveredQty + directSoldQty;
                
                const availableStock = lot.available_stock ?? lot.initial_quantity ?? lot.total_quantity;
                const freeStock = Math.max(0, availableStock - allottedQty - soldQty);

                return (
                  <div
                    key={lot.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                  >
                    {/* Header */}
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <div>
                        <p className="font-black text-gray-900 text-sm">
                          {plant?.plant_name ?? 'Unknown Plant'}
                          {plant?.variety ? (
                            <span className="text-gray-400 font-medium"> · {plant.variety}</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-gray-400 font-medium">
                          Lot #{lot.lot_name || lot.lot_number}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full ${
                          lot.status === 'Ready'
                            ? 'bg-emerald-100 text-emerald-700'
                            : lot.status === 'Growing'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {lot.status}
                      </span>
                    </div>

                    {/* Stats grid — Responsive layout */}
                    <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-5 gap-2 bg-gray-50 text-center">
                      <div className="bg-white p-2 rounded-lg border border-gray-100 col-span-2 sm:col-span-1">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('total')}</p>
                        <p className="text-xl font-black text-gray-700 mt-0.5">{lot.initial_quantity ?? lot.total_quantity}</p>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-gray-100">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Available</p>
                        <p className="text-lg font-black text-gray-800 mt-0.5">{availableStock}</p>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-gray-100">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('allotted')}</p>
                        <p className="text-lg font-black text-orange-600 mt-0.5">{allottedQty}</p>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-gray-100">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('sold')}</p>
                        <p className="text-lg font-black text-sky-600 mt-0.5">{soldQty}</p>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-gray-100">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('free')}</p>
                        <p className={`text-lg font-black mt-0.5 ${freeStock > 0 ? 'text-green-600' : 'text-red-500'}`}>{freeStock}</p>
                      </div>
                    </div>

                    {/* Ready Date */}
                    <div className="px-5 pb-4">
                      <p className="text-xs text-gray-400">
                        {t('expectedReadyDate')}:{' '}
                        <span className="font-semibold text-gray-600">
                          {lot.ready_date}
                        </span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {lots.length === 0 && (
        <div className="p-8 text-center text-gray-400 text-sm font-medium bg-white rounded-2xl border border-gray-100">
          {t('noLotsFoundReport')}
        </div>
      )}
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

// ─── Workers Report Tab ───────────────────────────────────────────────────────
function WorkersTab() {
  const [selectedDate, setSelectedDate] = useState(todayIST());
  const [selectedWorker, setSelectedWorker] = useState<string>('all');

  const { data: allTransactionsRaw } = useQuery({ queryKey: ['transactions'], queryFn: async () => { const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false }); return data || []; } });
  const { data: usersRaw } = useQuery({ queryKey: ['users'], queryFn: async () => { const { data } = await supabase.from('users').select('id, name, role'); return data || []; } });

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

  const txList = [];
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
              {workers.find(w => w.id === selectedWorker)?.name}'s Collection
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
          active={activeTab === 'lots'}
          onClick={() => setActiveTab('lots')}
        >
          <div className="flex flex-col items-center gap-0.5">
            <Layers className="w-4 h-4" />
            {t('lots')}
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
      {activeTab === 'lots' && <LotReportTab />}
      {activeTab === 'workers' && <WorkersTab />}
    </div>
  );
}
