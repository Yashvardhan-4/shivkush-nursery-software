'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  Banknote,
  Smartphone,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Sprout,
  ClipboardList,
  BarChart3,
  Layers,
} from 'lucide-react';

type Tab = 'reconciliation' | 'production' | 'lots';

// ─── helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN');
}
function today() {
  return new Date().toISOString().split('T')[0];
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

// ─── RECONCILIATION TAB ───────────────────────────────────────────────────────
function ReconciliationTab() {
  const [selectedDate, setSelectedDate] = useState(today());
  const todayStr = selectedDate;

  const salesRaw = useLiveQuery(() => db.direct_sales.toArray());
  const plantsRaw = useLiveQuery(() => db.plants.toArray());
  const bookingsRaw = useLiveQuery(() => db.bookings.toArray());

  if (!salesRaw || !plantsRaw || !bookingsRaw) {
    return <LoadingCard />;
  }

  // ── 1. Direct Sales ──
  const sales = salesRaw.filter((s) => s.created_at.startsWith(todayStr));

  // ── 2. Bookings Delivered Today ──
  const deliveredBookings = bookingsRaw.filter(b => b.delivery_date === todayStr && b.status === 'Delivered');

  // ── 3. Bookings Created Today (Advance) ──
  const newBookings = bookingsRaw.filter(b => b.created_at?.startsWith(todayStr));

  const dsCash = sales.reduce((sum, s) => sum + (s.payment_mode === 'Cash' ? s.amount : s.payment_mode === 'Split' ? (s.cash_amount || 0) : 0), 0);
  const dsUpi = sales.reduce((sum, s) => sum + (s.payment_mode === 'UPI' ? s.amount : s.payment_mode === 'Split' ? (s.upi_amount || 0) : 0), 0);

  const delCash = deliveredBookings.reduce((sum, b) => {
    if (b.payment_mode === 'Cash') return sum + Math.max(0, b.total_amount - (b.advance_paid || 0));
    if (b.payment_mode === 'Split') return sum + (b.cash_amount || 0);
    return sum;
  }, 0);

  const delUpi = deliveredBookings.reduce((sum, b) => {
    if (b.payment_mode === 'UPI') return sum + Math.max(0, b.total_amount - (b.advance_paid || 0));
    if (b.payment_mode === 'Split') return sum + (b.upi_amount || 0);
    return sum;
  }, 0);

  const advCash = newBookings.reduce((sum, b) => {
    if (b.advance_payment_mode === 'Cash' || !b.advance_payment_mode) return sum + (b.advance_paid || 0);
    if (b.advance_payment_mode === 'Split') return sum + (b.advance_cash_amount || 0);
    return sum;
  }, 0);

  const advUpi = newBookings.reduce((sum, b) => {
    if (b.advance_payment_mode === 'UPI') return sum + (b.advance_paid || 0);
    if (b.advance_payment_mode === 'Split') return sum + (b.advance_upi_amount || 0);
    return sum;
  }, 0);

  const cashTotal = dsCash + delCash + advCash;
  const upiTotal = dsUpi + delUpi + advUpi;
  const grandTotal = cashTotal + upiTotal;

  const plantMap = new Map(plantsRaw.map((p) => [p.id, p]));

  const getPlantName = (plantId: string) => {
    const plant = plantMap.get(plantId);
    if (!plant) return 'Unknown';
    return `${plant.plant_name}${plant.variety ? ' - ' + plant.variety : ''}`;
  };

  // Combine events for the list
  type CollectionEvent = {
    id: string;
    type: 'Direct Sale' | 'Booking Delivery' | 'Booking Advance';
    plant_name: string;
    customer_name: string;
    quantity: number;
    amount: number;
    payment_mode: string;
    cash_amount?: number;
    upi_amount?: number;
    timestamp: number;
  };

  const collectionEvents: CollectionEvent[] = [];

  sales.forEach(s => {
    collectionEvents.push({
      id: s.id!,
      type: 'Direct Sale',
      plant_name: getPlantName(s.plant_id),
      customer_name: s.customer_name || 'Walk-in',
      quantity: s.quantity,
      amount: s.amount,
      payment_mode: s.payment_mode,
      cash_amount: s.cash_amount,
      upi_amount: s.upi_amount,
      timestamp: new Date(s.created_at).getTime()
    });
  });

  deliveredBookings.forEach(b => {
    const collectedNow = Math.max(0, b.total_amount - (b.advance_paid || 0));
    if (collectedNow > 0) {
      collectionEvents.push({
        id: b.id! + '_del',
        type: 'Booking Delivery',
        plant_name: getPlantName(b.plant_id),
        customer_name: b.customer_name || 'Customer',
        quantity: b.quantity,
        amount: collectedNow,
        payment_mode: b.payment_mode || 'Cash',
        cash_amount: b.cash_amount || undefined,
        upi_amount: b.upi_amount || undefined,
        // Since delivery date is only a YYYY-MM-DD, we use 0 to float them, 
        // or if they just happened today, we can approximate by setting a high timestamp so they appear at the top
        // But b.created_at might be old. Let's use Date.now() for approximation, or a fake timestamp based on today.
        timestamp: new Date(b.delivery_date + 'T23:59:59').getTime() 
      });
    }
  });

  newBookings.forEach(b => {
    if (b.advance_paid && b.advance_paid > 0) {
      collectionEvents.push({
        id: b.id! + '_adv',
        type: 'Booking Advance',
        plant_name: getPlantName(b.plant_id),
        customer_name: b.customer_name || 'Customer',
        quantity: b.quantity,
        amount: b.advance_paid,
        payment_mode: b.advance_payment_mode || 'Cash',
        cash_amount: b.advance_cash_amount || undefined,
        upi_amount: b.advance_upi_amount || undefined,
        timestamp: new Date(b.created_at || Date.now()).getTime()
      });
    }
  });

  // Sort events by time descending (latest at top)
  collectionEvents.sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="space-y-4">
      {/* Date Picker Header */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center justify-between">
        <h3 className="font-bold text-gray-700 text-sm">Select Date</h3>
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
          Grand Total
        </p>
        <p className="text-5xl font-black tracking-tight">{fmt(grandTotal)}</p>
        <p className="text-xs opacity-70 mt-2">Collections for {todayStr}</p>
      </div>

      {/* Cash / UPI split */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="bg-green-600 p-2 rounded-xl">
              <Banknote className="w-4 h-4 text-white" />
            </div>
            <span className="text-xs font-bold text-green-800 uppercase tracking-wide">
              Cash
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
              UPI
            </span>
          </div>
          <p className="text-3xl font-black text-purple-700">{fmt(upiTotal)}</p>
        </div>
      </div>

      {/* Individual Sales List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-gray-400" />
          <h3 className="font-bold text-gray-700 text-sm">
            Collections ({collectionEvents.length})
          </h3>
        </div>

        {collectionEvents.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm font-medium">
            No collections recorded for {todayStr}.
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {collectionEvents.map((ev) => {
              return (
                <li key={ev.id} className="px-5 py-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm truncate flex items-center gap-2">
                      {ev.plant_name}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded text-white font-bold tracking-widest uppercase ${ev.type === 'Direct Sale' ? 'bg-blue-400' : ev.type === 'Booking Delivery' ? 'bg-green-500' : 'bg-purple-400'}`}>
                        {ev.type}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Qty: {ev.quantity} ·{' '}
                      {ev.customer_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-3 shrink-0">
                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
                        ev.payment_mode === 'Cash'
                          ? 'bg-green-100 text-green-700'
                          : ev.payment_mode === 'UPI'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}
                    >
                      {ev.payment_mode === 'Split' ? `SPLIT (₹${ev.cash_amount} 💵 + ₹${ev.upi_amount} 📱)` : ev.payment_mode.toUpperCase()}
                    </span>
                    <span className="font-black text-gray-900 text-sm">
                      {fmt(ev.amount)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── PRODUCTION DEMAND TAB ────────────────────────────────────────────────────
function ProductionDemandTab() {
  const plants = useLiveQuery(() => db.plants.where('active').equals(1).toArray());
  const bookings = useLiveQuery(() => db.bookings.toArray());
  const lots = useLiveQuery(() => db.lots.toArray());
  const allotments = useLiveQuery(() => db.allotments.toArray());

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

    const totalStock = lots
      .filter((l) => l.plant_id === plant.id && l.status !== 'Completed')
      .reduce((sum, l) => sum + l.total_quantity, 0);

    const totalGrowing = Math.max(0, totalStock - allottedToBookings);

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
            {alertCount} plant{alertCount > 1 ? 's' : ''} need{alertCount === 1 ? 's' : ''} more production
          </p>
        </div>
      ) : (
        <div className="bg-green-50 border-2 border-green-200 rounded-2xl px-5 py-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <p className="text-sm font-bold text-green-700">
            All stock levels are sufficient — great job!
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
                    Booked
                  </p>
                  <p className="text-2xl font-black text-blue-600">
                    {d.totalBooked}
                  </p>
                </div>
                <div className="text-gray-200 self-stretch border-l" />
                <div className="text-center">
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                    Growing
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
                  ⚠️ Need to Grow
                  <br />
                  <span className="text-lg">{d.deficit}</span> more
                </span>
              ) : (
                <span className="inline-block bg-green-100 text-green-700 border border-green-300 text-xs font-black px-3 py-2 rounded-xl text-center leading-tight">
                  ✅ Stock OK
                </span>
              )}
            </div>
          </div>
        </div>
      ))}

      {plants.length === 0 && (
        <div className="p-8 text-center text-gray-400 text-sm font-medium bg-white rounded-2xl border border-gray-100">
          No active plants found.
        </div>
      )}
    </div>
  );
}

// ─── LOT REPORT TAB ───────────────────────────────────────────────────────────
function LotReportTab() {
  const lots = useLiveQuery(() => db.lots.toArray());
  const plants = useLiveQuery(() => db.plants.toArray());
  const allotments = useLiveQuery(() => db.allotments.toArray());

  if (!lots || !plants || !allotments) {
    return <LoadingCard />;
  }

  const plantMap = new Map(plants.map((p) => [p.id, p]));

  // Build allotted qty per lot
  const allottedPerLot = new Map<string, number>();
  for (const a of allotments) {
    allottedPerLot.set(a.lot_id, (allottedPerLot.get(a.lot_id) ?? 0) + a.quantity);
  }

  const statusGroups: Array<{
    status: 'Growing' | 'Ready' | 'Completed';
    label: string;
    color: string;
    dotColor: string;
  }> = [
    { status: 'Ready', label: 'Ready to Deliver', color: 'text-emerald-700', dotColor: 'bg-emerald-500' },
    { status: 'Growing', label: 'Currently Growing', color: 'text-blue-700', dotColor: 'bg-blue-500' },
    { status: 'Completed', label: 'Completed', color: 'text-gray-500', dotColor: 'bg-gray-400' },
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
                {group.label}
                <span className="ml-2 text-gray-400 font-semibold">
                  ({groupLots.length})
                </span>
              </h3>
            </div>

            <div className="space-y-3">
              {groupLots.map((lot) => {
                const plant = plantMap.get(lot.plant_id);
                const allottedQty = allottedPerLot.get(lot.id) ?? 0;
                const freeStock = Math.max(0, lot.total_quantity - allottedQty);

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
                        </p>
                        <p className="text-xs text-gray-400 font-medium">
                          Lot #{lot.lot_number}
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

                    {/* Stats grid */}
                    <div className="px-5 py-4 grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Total
                        </p>
                        <p className="text-xl font-black text-gray-800 mt-1">
                          {lot.total_quantity}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Allotted
                        </p>
                        <p className="text-xl font-black text-orange-600 mt-1">
                          {allottedQty}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Free
                        </p>
                        <p
                          className={`text-xl font-black mt-1 ${
                            freeStock > 0 ? 'text-green-600' : 'text-red-500'
                          }`}
                        >
                          {freeStock}
                        </p>
                      </div>
                    </div>

                    {/* Ready Date */}
                    <div className="px-5 pb-4">
                      <p className="text-xs text-gray-400">
                        Ready Date:{' '}
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
          No lots found. Create your first lot in the Lots section.
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

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function ReportsDashboard() {
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
            Reconciliation
          </div>
        </TabBtn>
        <TabBtn
          active={activeTab === 'production'}
          onClick={() => setActiveTab('production')}
        >
          <div className="flex flex-col items-center gap-0.5">
            <BarChart3 className="w-4 h-4" />
            Production
          </div>
        </TabBtn>
        <TabBtn
          active={activeTab === 'lots'}
          onClick={() => setActiveTab('lots')}
        >
          <div className="flex flex-col items-center gap-0.5">
            <Layers className="w-4 h-4" />
            Lot Report
          </div>
        </TabBtn>
      </div>

      {/* Tab Content */}
      {activeTab === 'reconciliation' && <ReconciliationTab />}
      {activeTab === 'production' && <ProductionDemandTab />}
      {activeTab === 'lots' && <LotReportTab />}
    </div>
  );
}
