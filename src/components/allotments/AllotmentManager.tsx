'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, logAudit, generateId } from '@/lib/db';
import type { Booking, Lot, Plant, Allotment } from '@/lib/db';
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
  const statuses = new Set(items.map((i) => i.status));
  if (statuses.size === 1) return [...statuses][0];
  if (statuses.has('Delivered')) return 'Mixed';
  if (statuses.has('Allocated')) return 'Allocated';
  return 'Pending';
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Pending: 'bg-amber-100 text-amber-600 border border-amber-200',
    Allocated: 'bg-blue-100 text-blue-600 border border-blue-200',
    Delivered: 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30',
    Mixed: 'bg-purple-100 text-purple-600 border border-purple-200',
    Cancelled: 'bg-red-100 text-red-600 border border-red-200',
  };
  return (
    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${map[status] ?? 'bg-gray-200 text-gray-600'}`}>
      {status}
    </span>
  );
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
}: {
  booking: Booking;
  bookings: Booking[];
  lots: Lot[];
  allotments: Allotment[];
  plants: Plant[];
}) {
  const [selectedLotId, setSelectedLotId] = useState('');
  const [qty, setQty] = useState(booking.quantity);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const plant = plants.find((p) => p.id === booking.plant_id);
  const eligibleLots = lots.filter((l) => l.plant_id === booking.plant_id && l.status !== 'Completed');

  // Available qty in a lot = total - sum of allotments for that lot
  function availableInLot(lotId: string): number {
    const lot = lots.find((l) => l.id === lotId);
    if (!lot) return 0;
    const used = allotments
      .filter((a) => {
        if (a.lot_id !== lotId) return false;
        const b = bookings.find(b => b.id === a.booking_id);
        return b && b.status !== 'Delivered' && b.status !== 'Cancelled';
      })
      .reduce((sum, a) => sum + a.quantity, 0);
    return Math.max(0, lot.total_quantity - used);
  }

  const selectedLot = lots.find((l) => l.id === selectedLotId);
  const available = selectedLotId ? availableInLot(selectedLotId) : null;

  async function handleAllot() {
    setError('');
    if (!selectedLotId) { setError('Select a lot first.'); return; }
    if (qty <= 0) { setError('Quantity must be > 0.'); return; }
    if (available !== null && qty > available) {
      setError(`Only ${available} available in this lot.`);
      return;
    }
    setLoading(true);
    try {
      const user = getUser();
      const newId = generateId();
      const now = new Date().toISOString();

      // 1. Add allotment record
      await db.allotments.add({
        id: newId,
        booking_id: booking.id,
        lot_id: selectedLotId,
        quantity: qty,
        allotted_by: user.id || 'owner',
        allotted_at: now,
        sync_status: 'pending',
      });

      // 2. Update booking status
      await db.bookings.update(booking.id, {
        status: 'Allocated',
        lot_id: selectedLotId,
        sync_status: 'pending',
      });

      // 3. Push allotment to sync queue
      await db.sync_queue.add({
        table: 'allotments',
        action: 'INSERT',
        payload: {
          id: newId,
          booking_id: booking.id,
          lot_id: selectedLotId,
          quantity: qty,
          allotted_by: user.id || 'owner',
          allotted_at: now,
        },
        created_at: Date.now(),
      });

      // 4. Push booking update to sync queue
      await db.sync_queue.add({
        table: 'bookings',
        action: 'UPDATE',
        payload: { ...booking, status: 'Allocated', lot_id: selectedLotId, sync_status: undefined },
        created_at: Date.now(),
      });

      // 5. Audit log
      await logAudit(
        user.id || 'owner',
        user.name || 'Owner',
        'ALLOT_BOOKING',
        'allotments',
        newId,
        { booking_id: booking.id, lot_id: selectedLotId, quantity: qty }
      );
    } catch (e: any) {
      setError(e.message || 'Failed to allot.');
    } finally {
      setLoading(false);
    }
  }

  // If already allocated/delivered, show info instead
  if (booking.status !== 'Pending') {
    const allotment = allotments.find((a) => a.booking_id === booking.id);
    const allottedLot = lots.find((l) => l.id === (allotment?.lot_id ?? booking.lot_id));
    return (
      <div className="rounded-xl bg-gray-50/40 border border-gray-200/50 p-3 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800 truncate">
            {plant?.plant_name ?? 'Unknown Plant'}
            <span className="ml-2 text-gray-500 font-medium">× {booking.quantity}</span>
          </p>
          {allottedLot && (
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              <Layers className="w-3 h-3" /> Lot {allottedLot.lot_number}
              {allotment && <span className="ml-1">· {allotment.quantity} allotted</span>}
            </p>
          )}
        </div>
        <StatusBadge status={booking.status} />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white border border-gray-200 p-3 space-y-3">
      {/* Plant name + qty */}
      <div className="flex items-center gap-2">
        <Package className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="text-sm font-bold text-gray-900">
          {plant?.plant_name ?? 'Unknown Plant'}
          <span className="ml-2 text-amber-600">× {booking.quantity}</span>
        </span>
      </div>

      {/* Lot selector */}
      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
          Select Lot
        </label>
        <div className="relative">
          <select
            value={selectedLotId}
            onChange={(e) => { setSelectedLotId(e.target.value); setError(''); }}
            className="w-full bg-white border border-gray-200 text-gray-900 text-sm font-semibold rounded-xl px-3 py-2.5 pr-8 appearance-none outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40 transition-all"
          >
            <option value="">— Pick a lot —</option>
            {eligibleLots.map((lot) => {
              const avail = availableInLot(lot.id);
              return (
                <option key={lot.id} value={lot.id} disabled={avail === 0}>
                  {lot.lot_number} · {lot.status} · {avail} available
                </option>
              );
            })}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
        </div>

        {selectedLotId && (
          <p className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
            <CalendarDays className="w-3 h-3" />
            Ready: {selectedLot?.ready_date ?? 'N/A'} ·{' '}
            <span className={available === 0 ? 'text-red-400' : 'text-emerald-600'}>
              {available} available
            </span>
          </p>
        )}
      </div>

      {/* Quantity input */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
          Allot Quantity
        </label>
        <input
          type="number"
          min={1}
          max={available ?? booking.quantity}
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
        {loading ? 'Allotting…' : 'Allot to Booking'}
      </button>
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
}: {
  group: GroupedBooking;
  bookings: Booking[];
  lots: Lot[];
  allotments: Allotment[];
  plants: Plant[];
}) {
  const router = useRouter();

  const balanceDue = group.total_amount - group.total_advance;

  // Only show "Mark as Delivered" if ALL items are Allocated (not yet Delivered)
  const canDeliver = group.items.every((i) => i.status === 'Allocated');

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
          />
        ))}
      </div>

      {/* ── Footer: Financial summary ── */}
      <div className="mx-4 mb-4 mt-1 rounded-xl bg-gray-50/50 border border-gray-200/50 px-4 py-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-0.5">Total</p>
          <p className="text-sm font-black text-gray-900">₹{group.total_amount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-0.5">Advance</p>
          <p className="text-sm font-black text-emerald-600">₹{group.total_advance.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-0.5">Balance</p>
          <p className={`text-sm font-black ${balanceDue > 0 ? 'text-red-400' : 'text-emerald-600'}`}>
            ₹{balanceDue.toLocaleString()}
          </p>
        </div>
      </div>

      {/* ── Call + Deliver buttons ── */}
      {canDeliver && (
        <div className="px-4 pb-4 space-y-2">
          {/* Call customer before delivery */}
          <a
            href={`tel:${group.customer_phone}`}
            className="w-full bg-blue-600/20 border border-blue-200 text-blue-600 font-black text-sm py-3 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <Phone className="w-4 h-4" />
            Call {group.customer_name.split(' ')[0]} — Order Ready!
          </a>
          <button
            onClick={() => router.push('/bookings?search=' + group.booking_number)}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-gray-900 font-black text-sm py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
          >
            <Truck className="w-4 h-4" />
            Process Delivery in Bookings
          </button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Main: AllotmentManager
// ──────────────────────────────────────────────
export default function AllotmentManager() {
  const [filter, setFilter] = useState<'Pending' | 'Allocated' | 'Delivered' | 'All'>('Pending');

  const bookings = useLiveQuery(() => db.bookings.toArray());
  const lots = useLiveQuery(() => db.lots.toArray());
  const plants = useLiveQuery(() => db.plants.toArray());
  const allotments = useLiveQuery(() => db.allotments.toArray());

  if (!bookings || !lots || !plants || !allotments) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-600">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-amber-500 rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold">Loading…</p>
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
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Filter
  const displayed =
    filter === 'All'
      ? groupedList
      : groupedList.filter((g) => {
          if (filter === 'Pending') return g.groupStatus === 'Pending' || g.groupStatus === 'Mixed';
          return g.groupStatus === filter;
        });

  // Counts for filter tabs
  const counts = {
    Pending: groupedList.filter((g) => g.groupStatus === 'Pending' || g.groupStatus === 'Mixed').length,
    Allocated: groupedList.filter((g) => g.groupStatus === 'Allocated').length,
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
            {tab.label}
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
          <p className="text-gray-500 font-bold">No {filter !== 'All' ? filter.toLowerCase() : ''} bookings</p>
          <p className="text-gray-700 text-xs mt-1">
            {filter === 'Pending' ? 'All bookings have been processed.' : 'Nothing to show here.'}
          </p>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
