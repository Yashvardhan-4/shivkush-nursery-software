'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, logAudit, generateId } from '@/lib/db';
import type { Booking, Lot, Plant, Allotment, DirectSale } from '@/lib/db';
import {
  Package,
  Phone,
  MapPin,
  CheckCircle2,
  Truck,
  ChevronDown,
  Layers,
  AlertTriangle,
  CalendarDays,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface GroupedBooking {
  booking_number: string;
  customer_name: string;
  customer_phone: string;
  city?: string;
  items: Booking[];
  total_amount: number;
  total_advance: number;
  created_at: string;
  /** derived: 'Pending' | 'Allocated' | 'Delivered' | 'Mixed' */
  groupStatus: string;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function getUser() {
  if (typeof window === 'undefined') return { id: '', name: 'Owner' };
  try {
    return JSON.parse(localStorage.getItem('snms_user') || '{}');
  } catch {
    return { id: '', name: 'Owner' };
  }
}

function deriveGroupStatus(items: Booking[]): string {
  if (!items || items.length === 0) return 'Pending';
  const statuses = new Set(items.map((i) => i.status || 'Pending'));
  if (statuses.size === 1) return [...statuses][0];
  if (statuses.has('Delivered')) return 'Mixed';
  if (statuses.has('Allocated')) return 'Allocated';
  return 'Pending';
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  if (!status) return null;
  const map: Record<string, string> = {
    Pending: 'bg-amber-100 text-amber-600 border border-amber-200',
    Allocated: 'bg-blue-100 text-blue-600 border border-blue-200',
    Ready: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
    Delivered: 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30',
    Mixed: 'bg-purple-100 text-purple-600 border border-purple-200',
    Cancelled: 'bg-red-100 text-red-600 border border-red-200',
  };
  const statusKey = status.toLowerCase();
  return (
    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${map[status] ?? 'bg-gray-200 text-gray-600'}`}>
      {t(statusKey as any) || status}
    </span>
  );
}

function getAvailableInLot(lotId: string, lots: Lot[], allotments: Allotment[], bookings: Booking[], directSales: DirectSale[]): number {
  const lot = lots.find((l) => l.id === lotId);
  if (!lot) return 0;

  const activeBookingIds = new Set(
    bookings.filter(b => b.status !== 'Delivered' && b.status !== 'Cancelled').map(b => b.id)
  );

  const allottedQty = allotments
    .filter(a => a.lot_id === lotId && activeBookingIds.has(a.booking_id))
    .reduce((sum, a) => sum + a.quantity, 0);

  const availableStock = lot.available_stock ?? lot.total_quantity;
  return Math.max(0, availableStock - allottedQty);
}

// ──────────────────────────────────────────────
// Per-Item Allotment Row
// ──────────────────────────────────────────────
function AllotmentRow({
  booking,
  bookings,
  lots,
  allotments,
  plants,
  directSales,
}: {
  booking: Booking;
  bookings: Booking[];
  lots: Lot[];
  allotments: Allotment[];
  plants: Plant[];
  directSales: DirectSale[];
}) {
  const { t } = useLanguage();
  const [selectedLotId, setSelectedLotId] = useState('');
  
  const bookingAllots = allotments.filter((a) => a.booking_id === booking.id);
  const totalAllotted = bookingAllots.reduce((sum, a) => sum + a.quantity, 0);
  const remainingQty = Math.max(0, booking.quantity - totalAllotted);

  const [qty, setQty] = useState(remainingQty);
  useEffect(() => setQty(remainingQty), [remainingQty]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const plant = plants.find((p) => p.id === booking.plant_id);
  const eligibleLots = lots
    .filter((l) => l.plant_id === booking.plant_id && l.status !== 'Completed')
    .sort((a, b) => new Date(a.ready_date).getTime() - new Date(b.ready_date).getTime());
  
  const hasStock = eligibleLots.some(lot => getAvailableInLot(lot.id, lots, allotments, bookings, directSales) > 0);

  // Auto-select first available lot (FIFO)
  useEffect(() => {
    if (!selectedLotId && eligibleLots.length > 0) {
      const firstWithStock = eligibleLots.find(lot => getAvailableInLot(lot.id, lots, allotments, bookings, directSales) > 0);
      if (firstWithStock) {
        setSelectedLotId(firstWithStock.id);
      }
    }
  }, [eligibleLots, selectedLotId, lots, allotments, bookings, directSales]);

  function availableInLot(lotId: string): number {
    return getAvailableInLot(lotId, lots, allotments, bookings, directSales);
  }

  const selectedLot = lots.find((l) => l.id === selectedLotId);
  const available = selectedLotId ? availableInLot(selectedLotId) : null;

  async function handleRelease() {
    if (!confirm(t('releaseAllotmentConfirm'))) return;
    setLoading(true);
    setError('');
    try {
      const user = getUser();
      const bookingAllots = allotments.filter((a) => a.booking_id === booking.id);

      await db.transaction('rw', [db.allotments, db.bookings, db.sync_queue, db.audit_logs], async () => {
        // 1. Soft delete all allotment records
        for (const allotment of bookingAllots) {
          const deletedAt = new Date().toISOString();
          await db.allotments.update(allotment.id, { deleted_at: deletedAt, sync_status: 'pending' as const });
          await db.sync_queue.add({
            table: 'allotments',
            action: 'UPDATE',
            payload: { ...allotment, deleted_at: deletedAt },
            created_at: Date.now(),
          });
        }

        // 2. Reset booking status to Pending
        await db.bookings.update(booking.id, {
          status: 'Pending',
          lot_id: null,
          sync_status: 'pending',
        });
        await db.sync_queue.add({
          table: 'bookings',
          action: 'UPDATE',
          payload: { ...booking, status: 'Pending', lot_id: null, sync_status: undefined },
          created_at: Date.now(),
        });

        // 3. Audit log
        await logAudit(
          user.id || '00000000-0000-0000-0000-000000000000',
          user.name || 'Owner',
          'RELEASE_ALLOTMENT',
          'allotments',
          booking.id,
          { booking_id: booking.id, cleared_count: bookingAllots.length }
        );
      });
    } catch (e: any) {
      setError(e.message || t('releaseAllotmentError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleAllot() {
    setError('');
    if (!selectedLotId) { setError(t('selectLotFirstError')); return; }
    if (qty <= 0) { setError(t('qtyGreaterThanZeroError')); return; }
    if (available !== null && qty > available) {
      setError(t('onlyQtyAvailableError').replace('{available}', String(available)));
      return;
    }
    setLoading(true);
    try {
      const user = getUser();
      const newId = generateId();
      const now = new Date().toISOString();

      await db.transaction('rw', [db.allotments, db.bookings, db.sync_queue, db.audit_logs], async () => {
        // 1. Add allotment record
        await db.allotments.add({
          id: newId,
          booking_id: booking.id,
          lot_id: selectedLotId,
          quantity: qty,
          allotted_by: user.id || '00000000-0000-0000-0000-000000000000',
          allotted_at: now,
          sync_status: 'pending',
        });

        // 2. Update booking status if fully allotted
        if (totalAllotted + qty >= booking.quantity) {
            await db.bookings.update(booking.id, {
              status: 'Allocated',
              lot_id: selectedLotId,
              sync_status: 'pending',
            });
            await db.sync_queue.add({
              table: 'bookings',
              action: 'UPDATE',
              payload: { ...booking, status: 'Allocated', lot_id: selectedLotId, sync_status: undefined },
              created_at: Date.now(),
            });
        }

        // 5. Audit log
        await logAudit(
          user.id || '00000000-0000-0000-0000-000000000000',
          user.name || 'Owner',
          'ALLOT_BOOKING',
          'allotments',
          newId,
          { booking_id: booking.id, lot_id: selectedLotId, quantity: qty }
        );
      });
      setSelectedLotId('');
    } catch (e: any) {
      setError(e.message || 'Failed to allot.');
    } finally {
      setLoading(false);
    }
  }

  const allottedList = bookingAllots.map(a => {
      const l = lots.find(lot => lot.id === a.lot_id);
      return l ? `${l.lot_number} (${a.quantity})` : `Unknown (${a.quantity})`;
  });

  // If fully allocated/delivered or not pending, show info instead
  if (booking.status !== 'Pending' || remainingQty <= 0) {
    const showRelease = booking.status === 'Allocated' || booking.status === 'Ready' || booking.status === 'Pending';

    return (
      <div className="rounded-xl bg-gray-50/40 border border-gray-200/50 p-3 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800 truncate">
            {plant?.plant_name ?? 'Unknown Plant'}
            <span className="ml-2 text-gray-500 font-medium">× {booking.quantity}</span>
          </p>
          {bookingAllots.length > 0 && (
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              <Layers className="w-3 h-3" /> {t('lot')} {allottedList.join(', ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={booking.status === 'Pending' && remainingQty <= 0 ? 'Allocated' : booking.status} />
          {showRelease && (
            <button
              onClick={handleRelease}
              disabled={loading}
              className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-xl text-xs font-black transition-all active:scale-95 shrink-0 flex items-center gap-1"
              title={t('releaseAllotment')}
            >
              {t('release')}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white border border-gray-200 p-3 space-y-3">
      {/* Plant name + qty */}
      <div className="flex items-start gap-2">
        <Package className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <span className="text-sm font-bold text-gray-900">
            {plant?.plant_name ?? 'Unknown Plant'}
            <span className="ml-2 text-amber-600">× {booking.quantity}</span>
          </span>
          {totalAllotted > 0 && (
            <p className="text-[10px] text-gray-500 font-bold mt-0.5">
                Allotted: {allottedList.join(', ')} ({remainingQty} pending)
            </p>
          )}
        </div>
        {totalAllotted > 0 && (
            <button
              onClick={handleRelease}
              disabled={loading}
              className="px-2 py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-lg text-[10px] font-black transition-all active:scale-95 shrink-0"
            >
              {t('release')}
            </button>
        )}
      </div>

      {!hasStock ? (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex flex-col gap-2">
          <p className="text-xs font-bold text-red-700 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {t('noStockAvailable')}
          </p>
          <a
            href="/lots/new"
            className="text-xs text-center font-black text-white bg-red-600 hover:bg-red-700 py-1.5 px-3 rounded-lg active:scale-95 transition-all"
          >
            {t('createNewLot')}
          </a>
        </div>
      ) : (
        <>
          {/* Lot selector */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                {t('selectLot')}
              </label>
            </div>
            <div className="relative">
              <select
                value={selectedLotId}
                onChange={(e) => { setSelectedLotId(e.target.value); setError(''); }}
                className="w-full bg-white border border-gray-200 text-gray-900 text-sm font-semibold rounded-xl px-3 py-2.5 pr-8 appearance-none outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40 transition-all"
              >
                <option value="">{t('pickLot')}</option>
                {eligibleLots.map((lot) => {
                  const avail = availableInLot(lot.id);
                  return (
                    <option key={lot.id} value={lot.id} disabled={avail === 0}>
                      {lot.lot_name || lot.lot_number} · {t(lot.status.toLowerCase() as any)} · {avail} {t('free')}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>

            {selectedLotId && (
              <p className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                <CalendarDays className="w-3 h-3" />
                {t('ready')}: {selectedLot?.ready_date ?? 'N/A'} ·{' '}
                <span className={available === 0 ? 'text-red-400' : 'text-emerald-600'}>
                  {available} {t('free')}
                </span>
              </p>
            )}
          </div>

          {/* Quantity input */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
              {t('allotQty')}
            </label>
              <input
                type="number"
                min={1}
                max={Math.min(available ?? remainingQty, remainingQty)}
                value={qty}
                onChange={(e) => { setQty(Number(e.target.value)); setError(''); }}
                className="w-full bg-white border border-gray-200 text-gray-900 text-sm font-semibold rounded-xl px-3 py-2.5 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40 transition-all"
              />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs font-bold bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Allot button */}
          <button
            onClick={handleAllot}
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-black text-sm py-2.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {loading ? t('allotting') : t('allotToBooking')}
          </button>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Booking Card
// ──────────────────────────────────────────────
function BookingCard({
  group,
  bookings,
  lots,
  allotments,
  plants,
  directSales,
}: {
  group: GroupedBooking;
  bookings: Booking[];
  lots: Lot[];
  allotments: Allotment[];
  plants: Plant[];
  directSales: DirectSale[];
}) {
  const { t } = useLanguage();
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoError, setAutoError] = useState('');

  const balanceDue = group.total_amount - group.total_advance;
  const hasPending = group.items.some((i) => i.status === 'Pending');

  // Card accent based on status
  const accentMap: Record<string, string> = {
    Pending: 'border-amber-200',
    Allocated: 'border-blue-200',
    Delivered: 'border-emerald-200',
    Mixed: 'border-purple-200',
  };
  const accent = accentMap[group.groupStatus] ?? 'border-gray-200';

  return (
    <div className={`bg-white rounded-2xl border ${accent} overflow-hidden shadow-xl`}>
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-200">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-black text-gray-900 truncate">{group.customer_name}</h3>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <a
                href={`tel:${group.customer_phone}`}
                className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full active:scale-95 transition-all"
              >
                <Phone className="w-3 h-3" />
                {group.customer_phone}
              </a>
              {group.city && (
                <span className="flex items-center gap-1 text-xs text-gray-500 font-medium">
                  <MapPin className="w-3 h-3" />
                  {group.city}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <StatusBadge status={group.groupStatus} />
            <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">
              {group.booking_number}
            </span>
          </div>
        </div>
      </div>
      {/* ── Auto Allot Button removed ── */}
      {/* ── Items ── */}
      <div className="px-4 pt-3 pb-2 space-y-3">
        {group.items.map((item) => (
          <AllotmentRow
            key={item.id}
            booking={item}
            bookings={bookings}
            lots={lots}
            allotments={allotments}
            plants={plants}
            directSales={directSales}
          />
        ))}
      </div>

      {/* ── Footer: Financial summary ── */}
      <div className="mx-4 mb-4 mt-1 rounded-xl bg-gray-50/50 border border-gray-200/50 px-4 py-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-0.5">{t('stock')}</p>
          <p className="text-sm font-black text-gray-900">₹{group.total_amount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-0.5">{t('advancePaid')}</p>
          <p className="text-sm font-black text-emerald-600">₹{group.total_advance.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-0.5">{t('balance')}</p>
          <p className={`text-sm font-black ${balanceDue > 0 ? 'text-red-400' : 'text-emerald-600'}`}>
            ₹{balanceDue.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main: AllotmentManager
// ──────────────────────────────────────────────
export default function AllotmentManager() {
  const { t } = useLanguage();
  const [filter, setFilter] = useState<'Pending' | 'Allocated' | 'Delivered' | 'All'>('Pending');

  const bookings = useLiveQuery(() => db.bookings.toArray());
  const lots = useLiveQuery(() => db.lots.toArray());
  const plants = useLiveQuery(() => db.plants.toArray());
  const allotments = useLiveQuery(() => db.allotments.toArray());
  const directSales = useLiveQuery(() => db.direct_sales.toArray());

  if (!bookings || !lots || !plants || !allotments || !directSales) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-600">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-amber-500 rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold">{t('loadingLots')}</p>
      </div>
    );
  }

  // Group bookings by booking_number (all statuses except Cancelled)
  const grouped = bookings
    .filter((b) => b.status !== 'Cancelled')
    .reduce((acc, curr) => {
      if (!acc[curr.booking_number]) {
        acc[curr.booking_number] = {
          booking_number: curr.booking_number,
          customer_name: curr.customer_name,
          customer_phone: curr.customer_phone,
          city: curr.city,
          items: [],
          total_amount: 0,
          total_advance: 0,
          created_at: curr.created_at || curr.booking_date,
          groupStatus: 'Pending',
        };
      }
      acc[curr.booking_number].items.push(curr);
      acc[curr.booking_number].total_amount += curr.total_amount;
      acc[curr.booking_number].total_advance += curr.advance_paid;
      return acc;
    }, {} as Record<string, GroupedBooking>);

  // Derive each group's consolidated status
  const groupedList: GroupedBooking[] = Object.values(grouped)
    .map((g) => ({ ...g, groupStatus: deriveGroupStatus(g.items) }))
    .sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
    });

  // Filter
  const displayed =
    filter === 'All'
      ? groupedList
      : groupedList.filter((g) => {
          if (filter === 'Pending') return g.groupStatus === 'Pending' || g.groupStatus === 'Mixed';
          if (filter === 'Allocated') return g.groupStatus === 'Allocated' || g.groupStatus === 'Ready';
          return g.groupStatus === filter;
        });

  // Counts for filter tabs
  const counts = {
    Pending: groupedList.filter((g) => g.groupStatus === 'Pending' || g.groupStatus === 'Mixed').length,
    Allocated: groupedList.filter((g) => g.groupStatus === 'Allocated' || g.groupStatus === 'Ready').length,
    Delivered: groupedList.filter((g) => g.groupStatus === 'Delivered').length,
    All: groupedList.length,
  };

  const tabs: Array<{ key: typeof filter; label: string; activeClass: string }> = [
    { key: 'Pending', label: 'Pending', activeClass: 'bg-amber-100 text-amber-600 border-amber-500/40' },
    { key: 'Allocated', label: 'Allocated', activeClass: 'bg-blue-100 text-blue-600 border-blue-500/40' },
    { key: 'Delivered', label: 'Delivered', activeClass: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/40' },
    { key: 'All', label: 'All', activeClass: 'bg-gray-200 text-gray-800 border-gray-600' },
  ];

  return (
    <div className="px-4 pt-3 space-y-4">
      {/* ── Filter Tabs ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border transition-all ${
              filter === tab.key
                ? tab.activeClass
                : 'bg-white text-gray-500 border-gray-800 hover:border-gray-200'
            }`}
          >
            {t(tab.key.toLowerCase() as any)}
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
              filter === tab.key ? 'bg-white/10' : 'bg-gray-50'
            }`}>
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* ── Cards ── */}
      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center mb-4">
            <Package className="w-7 h-7 text-gray-600" />
          </div>
          <p className="text-gray-500 font-bold">{t('noBookingsFound')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayed.map((group) => (
            <BookingCard
              key={group.booking_number}
              group={group}
              bookings={bookings}
              lots={lots}
              allotments={allotments}
              plants={plants}
              directSales={directSales}
            />
          ))}
        </div>
      )}
    </div>
  );
}
