'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, toLocalDateStr } from '@/lib/db';
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

type Tab = 'reconciliation' | 'production' | 'lots';

// ─── helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN');
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

  const salesRaw = useLiveQuery(() => db.direct_sales.toArray());
  const plantsRaw = useLiveQuery(() => db.plants.toArray());
  const bookingsRaw = useLiveQuery(() => db.bookings.toArray());
  const auditLogsRaw = useLiveQuery(() => db.audit_logs.toArray());

  if (!salesRaw || !plantsRaw || !bookingsRaw || !auditLogsRaw) {
    return <LoadingCard />;
  }

  // ── 1. Direct Sales ──
  const sales = salesRaw.filter((s) => s.created_at && toLocalDateStr(s.created_at) === todayStr);

  // ── 2. Bookings Delivered Today ──
  const deliveredBookings = bookingsRaw.filter(b => b.delivery_date === todayStr && b.status === 'Delivered');

  // ── 3. Bookings Created Today (Advance) ──
  const newBookings = bookingsRaw.filter(b => b.created_at && toLocalDateStr(b.created_at) === todayStr);

  // Group by sale_number FIRST so that Split-payment multi-item sales only contribute
  // cash_amount / upi_amount once.  Each row for the same sale stores the *whole-sale*
  // split amounts (not per-item), so summing row-by-row would multiply them by item count.
  const salesBySaleNumber = sales.reduce((groups, s) => {
    if (!groups[s.sale_number]) groups[s.sale_number] = [];
    groups[s.sale_number].push(s);
    return groups;
  }, {} as Record<string, typeof sales>);

  const dsCash = Object.values(salesBySaleNumber).reduce((sum, group) => {
    const first = group[0];
    if (first.payment_mode === 'Cash') return sum + group.reduce((s, item) => s + item.amount, 0);
    if (first.payment_mode === 'Split') return sum + (first.cash_amount || 0);
    return sum; // UPI — no cash contribution
  }, 0);

  const dsUpi = Object.values(salesBySaleNumber).reduce((sum, group) => {
    const first = group[0];
    if (first.payment_mode === 'UPI') return sum + group.reduce((s, item) => s + item.amount, 0);
    if (first.payment_mode === 'Split') return sum + (first.upi_amount || 0);
    return sum; // Cash — no UPI contribution
  }, 0);

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
  const deliveryLogs = new Map(
    auditLogsRaw
      .filter(l => l.action === 'DELIVER_BOOKING')
      .map(l => [l.record_id, new Date(l.created_at).getTime()])
  );

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
    order_number: string;
  };

  const collectionEvents: CollectionEvent[] = [];

  // Group Direct Sales by sale_number
  const salesByNumber: Record<string, typeof sales> = {};
  sales.forEach(s => {
    if (!salesByNumber[s.sale_number]) salesByNumber[s.sale_number] = [];
    salesByNumber[s.sale_number].push(s);
  });

  Object.entries(salesByNumber).forEach(([saleNo, items]) => {
    const first = items[0];
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
    const plantNames = items.map(item => `${getPlantName(item.plant_id)} ×${item.quantity}`).join(', ');
    collectionEvents.push({
      id: `ds_${saleNo}`,
      type: 'Direct Sale',
      plant_name: plantNames,
      customer_name: first.customer_name || 'Walk-in',
      quantity: totalQty,
      amount: totalAmount,
      payment_mode: first.payment_mode,
      cash_amount: first.cash_amount ?? undefined,
      upi_amount: first.upi_amount ?? undefined,
      timestamp: new Date(first.created_at).getTime(),
      order_number: saleNo,
    });
  });

  // Group Booking Deliveries by booking_number
  const delBookingsByNumber: Record<string, typeof deliveredBookings> = {};
  deliveredBookings.forEach(b => {
    if (!delBookingsByNumber[b.booking_number]) delBookingsByNumber[b.booking_number] = [];
    delBookingsByNumber[b.booking_number].push(b);
  });

  Object.entries(delBookingsByNumber).forEach(([bookingNo, items]) => {
    const first = items[0];
    const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalCollected = items.reduce((sum, item) => sum + Math.max(0, item.total_amount - (item.advance_paid || 0)), 0);
    if (totalCollected > 0) {
      const plantNames = items.map(item => `${getPlantName(item.plant_id)} ×${item.quantity}`).join(', ');
      let totalCash: number | undefined = undefined;
      let totalUpi: number | undefined = undefined;
      items.forEach(item => {
        if (item.cash_amount !== undefined && item.cash_amount !== null)
          totalCash = (totalCash || 0) + item.cash_amount;
        if (item.upi_amount !== undefined && item.upi_amount !== null)
          totalUpi = (totalUpi || 0) + item.upi_amount;
      });
      collectionEvents.push({
        id: `del_${bookingNo}`,
        type: 'Booking Delivery',
        plant_name: plantNames,
        customer_name: first.customer_name || 'Customer',
        quantity: totalQty,
        amount: totalCollected,
        payment_mode: first.payment_mode || 'Cash',
        cash_amount: totalCash,
        upi_amount: totalUpi,
        timestamp: deliveryLogs.get(bookingNo) || new Date(first.delivery_date + 'T23:59:59').getTime(),
        order_number: bookingNo,
      });
    }
  });

  // Group Booking Advances by booking_number
  const newBookingsByNumber: Record<string, typeof newBookings> = {};
  newBookings.forEach(b => {
    if (!newBookingsByNumber[b.booking_number]) newBookingsByNumber[b.booking_number] = [];
    newBookingsByNumber[b.booking_number].push(b);
  });

  Object.entries(newBookingsByNumber).forEach(([bookingNo, items]) => {
    const first = items[0];
    const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAdvance = items.reduce((sum, item) => sum + (item.advance_paid || 0), 0);
    if (totalAdvance > 0) {
      const plantNames = items.map(item => `${getPlantName(item.plant_id)} ×${item.quantity}`).join(', ');
      let totalCash: number | undefined = undefined;
      let totalUpi: number | undefined = undefined;
      items.forEach(item => {
        if (item.advance_cash_amount !== undefined && item.advance_cash_amount !== null)
          totalCash = (totalCash || 0) + item.advance_cash_amount;
        if (item.advance_upi_amount !== undefined && item.advance_upi_amount !== null)
          totalUpi = (totalUpi || 0) + item.advance_upi_amount;
      });
      collectionEvents.push({
        id: `adv_${bookingNo}`,
        type: 'Booking Advance',
        plant_name: plantNames,
        customer_name: first.customer_name || 'Customer',
        quantity: totalQty,
        amount: totalAdvance,
        payment_mode: first.advance_payment_mode || 'Cash',
        cash_amount: totalCash,
        upi_amount: totalUpi,
        timestamp: new Date(first.created_at || Date.now()).getTime(),
        order_number: bookingNo,
      });
    }
  });

  // Sort events by time descending (latest at top)
  collectionEvents.sort((a, b) => b.timestamp - a.timestamp);

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
  const plants = useLiveQuery(async () => {
    const all = await db.plants.toArray();
    return all.filter(p => p.active);
  });
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
  const lots = useLiveQuery(() => db.lots.toArray());
  const plants = useLiveQuery(() => db.plants.toArray());
  const allotments = useLiveQuery(() => db.allotments.toArray());
  const bookings = useLiveQuery(() => db.bookings.toArray());
  const directSales = useLiveQuery(() => db.direct_sales.toArray());

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

                    {/* Stats grid — 5 columns */}
                    <div className="px-4 py-4 grid grid-cols-5 gap-1 text-center">
                      {/* Total */}
                      <div>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                          {t('total')}
                        </p>
                        <p className="text-lg font-black text-gray-700 mt-0.5">
                          {lot.initial_quantity ?? lot.total_quantity}
                        </p>
                      </div>
                      {/* Stock */}
                      <div className="border-l border-gray-100">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                          Available
                        </p>
                        <p className="text-lg font-black text-gray-800 mt-0.5">
                          {availableStock}
                        </p>
                      </div>
                      {/* Allotted */}
                      <div className="border-l border-gray-100">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                          {t('allotted')}
                        </p>
                        <p className="text-lg font-black text-orange-600 mt-0.5">
                          {allottedQty}
                        </p>
                      </div>
                      {/* Sold */}
                      <div className="border-l border-gray-100">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                          {t('sold')}
                        </p>
                        <p className="text-lg font-black text-sky-600 mt-0.5">
                          {soldQty}
                        </p>
                      </div>
                      {/* Free */}
                      <div className="border-l border-gray-100">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                          {t('free')}
                        </p>
                        <p
                          className={`text-lg font-black mt-0.5 ${
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
      </div>

      {/* Tab Content */}
      {activeTab === 'reconciliation' && <ReconciliationTab />}
      {activeTab === 'production' && <ProductionDemandTab />}
      {activeTab === 'lots' && <LotReportTab />}
    </div>
  );
}
