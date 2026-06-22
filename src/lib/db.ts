import Dexie, { type EntityTable } from 'dexie';

// =========================================
// INTERFACES
// =========================================

export interface PricingTier {
  min_quantity: number;
  price: number;
}

export interface Plant {
  id: string;
  plant_name: string;
  variety: string;       // e.g. "Grafted", "Seedling"
  category?: string;
  selling_price: number;
  active: boolean;
  pricing_tiers?: PricingTier[];
}

export interface PaymentQR {
  id: string;
  upi_id: string;
  image_data: string | null;  // base64 encoded image or URL
  name: string;               // e.g. "HDFC Account", "Owner GPay"
  active: boolean;
  sync_status: 'synced' | 'pending';
  created_at: string;
}

export interface Lot {
  id: string;
  lot_number: string;
  lot_name?: string;
  plant_id: string;
  total_quantity: number;
  initial_quantity?: number;
  available_stock?: number;
  ready_date: string;    // ISO date YYYY-MM-DD
  status: 'Growing' | 'Ready' | 'Completed';
  notes: string | null;
  created_at?: string;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  city: string | null;
}

export interface User {
  id: string;
  name: string;
  role: 'owner' | 'worker';
}

// A Booking row represents ONE plant line in a booking order.
// Multiple rows can share the same booking_number (cart).
export interface Booking {
  id: string;
  booking_number: string;
  customer_name: string;
  customer_phone: string;
  city?: string;
  plant_id: string;
  lot_id: string | null;       // set after allotment
  quantity: number;
  advance_paid: number;
  advance_payment_mode?: 'Cash' | 'UPI' | 'Split' | null;
  advance_cash_amount?: number | null;
  advance_upi_amount?: number | null;
  total_amount: number;
  booking_date: string;
  delivery_date: string | null;
  status: 'Pending' | 'Allocated' | 'Ready' | 'Delivered' | 'Cancelled';
  remarks: string | null;
  payment_mode?: 'Cash' | 'UPI' | 'Split';
  cash_amount?: number;
  upi_amount?: number;
  worker_id?: string;
  assigned_to?: string | null;
  sync_status: 'synced' | 'pending';
  created_at?: string;
}

// Allotment: Owner assigns a specific lot's plants to a booking
export interface Allotment {
  id: string;
  booking_id: string;
  lot_id: string;
  quantity: number;
  allotted_by: string;   // owner user id
  allotted_at: string;   // ISO timestamp
  sync_status: 'synced' | 'pending';
}

export interface DirectSale {
  id: string;
  sale_number: string;
  customer_name?: string;
  customer_phone?: string;
  plant_id: string;
  lot_id?: string | null;   // which lot the plants came from (Fix #002)
  quantity: number;
  amount: number;
  payment_mode: 'Cash' | 'UPI' | 'Split';
  cash_amount?: number;   // filled when mode is Cash or Split
  upi_amount?: number;    // filled when mode is UPI or Split
  worker_id: string;
  assigned_to?: string | null;
  fulfillment_status?: 'Pending Handover' | 'Fulfilled';
  sync_status: 'synced' | 'pending';
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  worker_id: string;
  worker_name: string;
  date: string;           // YYYY-MM-DD
  status: 'Present' | 'Absent' | 'Half Day';
  marked_by: string;
  sync_status: 'synced' | 'pending';
}

export interface AuditLog {
  id?: number;
  user_id: string;
  user_name: string;
  action: string;         // e.g. "CREATE_BOOKING", "COMPLETE_BOOKING", "CREATE_SALE"
  table_name: string;
  record_id: string;
  details: string;        // JSON stringified details
  created_at: string;
}

export interface SyncQueueItem {
  id?: number;
  table: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: any;
  created_at: number;
}

// =========================================
// DEXIE DB
// =========================================

const db = new Dexie('SNMS_OfflineDB') as Dexie & {
  plants: EntityTable<Plant, 'id'>;
  lots: EntityTable<Lot, 'id'>;
  customers: EntityTable<Customer, 'id'>;
  users: EntityTable<User, 'id'>;
  bookings: EntityTable<Booking, 'id'>;
  allotments: EntityTable<Allotment, 'id'>;
  direct_sales: EntityTable<DirectSale, 'id'>;
  attendance: EntityTable<AttendanceRecord, 'id'>;
  audit_logs: EntityTable<AuditLog, 'id'>;
  sync_queue: EntityTable<SyncQueueItem, 'id'>;
  payment_qrs: EntityTable<PaymentQR, 'id'>;
};

// Version 4: Added users table for worker name resolving
db.version(4).stores({
  plants: 'id, plant_name, variety, category, active',
  lots: 'id, lot_number, plant_id, status',
  customers: 'id, mobile, name',
  users: 'id, name, role',
  bookings: 'id, booking_number, customer_name, customer_phone, plant_id, lot_id, status, sync_status, created_at',
  allotments: 'id, booking_id, lot_id, sync_status',
  direct_sales: 'id, sale_number, plant_id, sync_status, created_at',
  attendance: 'id, worker_id, date, status',
  audit_logs: '++id, user_id, action, table_name, record_id, created_at',
  sync_queue: '++id, table, action, created_at'
});

// Version 5: Added lot_id index to direct_sales (Fix #002 — inventory accuracy)
db.version(5).stores({
  plants: 'id, plant_name, variety, category, active',
  lots: 'id, lot_number, plant_id, status',
  customers: 'id, mobile, name',
  users: 'id, name, role',
  bookings: 'id, booking_number, customer_name, customer_phone, plant_id, lot_id, status, sync_status, created_at',
  allotments: 'id, booking_id, lot_id, sync_status',
  direct_sales: 'id, sale_number, plant_id, lot_id, sync_status, created_at',
  attendance: 'id, worker_id, date, status',
  audit_logs: '++id, user_id, action, table_name, record_id, created_at',
  sync_queue: '++id, table, action, created_at'
});

// Version 6: Added available_stock to lots, fixed initial_quantity
db.version(6).stores({
  plants: 'id, plant_name, variety, category, active',
  lots: 'id, lot_number, plant_id, status',
  customers: 'id, mobile, name',
  users: 'id, name, role',
  bookings: 'id, booking_number, customer_name, customer_phone, plant_id, lot_id, status, sync_status, created_at',
  allotments: 'id, booking_id, lot_id, sync_status',
  direct_sales: 'id, sale_number, plant_id, lot_id, sync_status, created_at',
  attendance: 'id, worker_id, date, status',
  audit_logs: '++id, user_id, action, table_name, record_id, created_at',
  sync_queue: '++id, table, action, created_at'
}).upgrade(async tx => {
  await tx.table('lots').toCollection().modify(lot => {
    if (lot.initial_quantity === undefined) {
      lot.initial_quantity = lot.total_quantity;
    }
    if (lot.available_stock === undefined) {
      lot.available_stock = lot.total_quantity;
    }
  });
});

// Version 7: Added payment_qrs table
db.version(7).stores({
  plants: 'id, plant_name, variety, category, active',
  lots: 'id, lot_number, plant_id, status',
  customers: 'id, mobile, name',
  users: 'id, name, role',
  bookings: 'id, booking_number, customer_name, customer_phone, plant_id, lot_id, status, sync_status, created_at',
  allotments: 'id, booking_id, lot_id, sync_status',
  direct_sales: 'id, sale_number, plant_id, lot_id, sync_status, created_at',
  attendance: 'id, worker_id, date, status',
  audit_logs: '++id, user_id, action, table_name, record_id, created_at',
  sync_queue: '++id, table, action, created_at',
  payment_qrs: 'id, active, sync_status'
});

// Version 8: Added assigned_to index for fulfillment filtering
db.version(8).stores({
  plants: 'id, plant_name, variety, category, active',
  lots: 'id, lot_number, plant_id, status',
  customers: 'id, mobile, name',
  users: 'id, name, role',
  bookings: 'id, booking_number, customer_name, customer_phone, plant_id, lot_id, status, sync_status, created_at, assigned_to',
  allotments: 'id, booking_id, lot_id, sync_status',
  direct_sales: 'id, sale_number, plant_id, lot_id, sync_status, created_at, assigned_to',
  attendance: 'id, worker_id, date, status',
  audit_logs: '++id, user_id, action, table_name, record_id, created_at',
  sync_queue: '++id, table, action, created_at',
  payment_qrs: 'id, active, sync_status'
});

// Version 9: Added lot_name to lots table
db.version(9).stores({
  plants: 'id, plant_name, variety, category, active',
  lots: 'id, lot_number, lot_name, plant_id, status',
  customers: 'id, mobile, name',
  users: 'id, name, role',
  bookings: 'id, booking_number, customer_name, customer_phone, plant_id, lot_id, status, sync_status, created_at, assigned_to',
  allotments: 'id, booking_id, lot_id, sync_status',
  direct_sales: 'id, sale_number, plant_id, lot_id, sync_status, created_at, assigned_to',
  attendance: 'id, worker_id, date, status',
  audit_logs: '++id, user_id, action, table_name, record_id, created_at',
  sync_queue: '++id, table, action, created_at',
  payment_qrs: 'id, active, sync_status'
});

// Version 10: pricing_tiers field added to plants (stored as JSON, no index needed)
db.version(10).stores({
  plants: 'id, plant_name, variety, category, active',
  lots: 'id, lot_number, lot_name, plant_id, status',
  customers: 'id, mobile, name',
  users: 'id, name, role',
  bookings: 'id, booking_number, customer_name, customer_phone, plant_id, lot_id, status, sync_status, created_at, assigned_to',
  allotments: 'id, booking_id, lot_id, sync_status',
  direct_sales: 'id, sale_number, plant_id, lot_id, sync_status, created_at, assigned_to',
  attendance: 'id, worker_id, date, status',
  audit_logs: '++id, user_id, action, table_name, record_id, created_at',
  sync_queue: '++id, table, action, created_at',
  payment_qrs: 'id, active, sync_status'
});
// =========================================
// HELPER: Log an audit event
// =========================================
export async function logAudit(userId: string, userName: string, action: string, tableName: string, recordId: string, details: object) {
  await db.audit_logs.add({
    user_id: userId,
    user_name: userName,
    action,
    table_name: tableName,
    record_id: recordId,
    details: JSON.stringify(details),
    created_at: new Date().toISOString()
  });
}

// =========================================
// HELPER: Calculate Free Stock for a plant
// Free Stock = Total in Lots - Allotted to Bookings
// =========================================
export async function getFreeStock(plantId: string): Promise<number> {
  const lots = await db.lots.where('plant_id').equals(plantId).toArray();
  const totalStock = lots.reduce((sum, l) => sum + (l.available_stock ?? l.total_quantity), 0);

  const allotments = await db.allotments.toArray();
  // Only count active bookings (not Delivered or Cancelled) as consuming stock
  const activeBookings = await db.bookings
    .where('plant_id').equals(plantId)
    .filter(b => b.status !== 'Delivered' && b.status !== 'Cancelled')
    .toArray();
  const activeBookingIds = new Set(activeBookings.map(b => b.id));
  const allottedQty = allotments
    .filter(a => activeBookingIds.has(a.booking_id))
    .reduce((sum, a) => sum + a.quantity, 0);

  return Math.max(0, totalStock - allottedQty);
}

// =========================================
// HELPER: Generate Secure UUID for offline records
// =========================================
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// =========================================
// HELPER: Resolve plant price based on quantity tiers
// Returns the best matching tier price, or falls back to selling_price
// =========================================
export function resolvePlantPrice(plant: Plant, quantity: number): number {
  const tiers = plant.pricing_tiers;
  if (!tiers || tiers.length === 0) return plant.selling_price;
  // Find all tiers whose min_quantity is <= the ordered quantity
  const applicable = tiers.filter(t => t.min_quantity <= quantity);
  if (applicable.length === 0) return plant.selling_price;
  // Use the tier with the highest min_quantity (most specific match)
  applicable.sort((a, b) => b.min_quantity - a.min_quantity);
  return applicable[0].price;
}

export async function splitAndDeliverBooking(
  bookingId: string, 
  deliverQty: number, 
  userId: string, 
  userName: string
): Promise<void> {
  await db.transaction('rw', [db.bookings, db.allotments, db.lots, db.sync_queue, db.audit_logs], async () => {
    const booking = await db.bookings.get(bookingId);
    if (!booking) throw new Error('Booking not found');
    if (deliverQty <= 0 || deliverQty > booking.quantity) {
      throw new Error('Invalid delivery quantity');
    }

    const isPartial = deliverQty < booking.quantity;
    const remainingQty = booking.quantity - deliverQty;

    // Proportional amounts
    const unitPrice = booking.total_amount / booking.quantity;
    const deliveredAmount = Math.round(deliverQty * unitPrice * 100) / 100;
    const remainingAmount = Math.round((booking.total_amount - deliveredAmount) * 100) / 100;

    const deliveredAdvance = Math.round((booking.advance_paid * (deliverQty / booking.quantity)) * 100) / 100;
    const remainingAdvance = Math.round((booking.advance_paid - deliveredAdvance) * 100) / 100;

    // Split split amounts if Split payment mode
    const deliveredCash = booking.advance_cash_amount 
      ? Math.round((booking.advance_cash_amount * (deliverQty / booking.quantity)) * 100) / 100
      : null;
    const remainingCash = booking.advance_cash_amount 
      ? Math.round((booking.advance_cash_amount - (deliveredCash || 0)) * 100) / 100
      : null;

    const deliveredUpi = booking.advance_upi_amount
      ? Math.round((booking.advance_upi_amount * (deliverQty / booking.quantity)) * 100) / 100
      : null;
    const remainingUpi = booking.advance_upi_amount
      ? Math.round((booking.advance_upi_amount - (deliveredUpi || 0)) * 100) / 100
      : null;

    if (isPartial) {
      // 1. Create a new booking row for the remaining quantity
      const newBookingId = generateId();
      const remainingBooking: Booking = {
        ...booking,
        id: newBookingId,
        quantity: remainingQty,
        total_amount: remainingAmount,
        advance_paid: remainingAdvance,
        advance_cash_amount: remainingCash,
        advance_upi_amount: remainingUpi,
        sync_status: 'pending',
        status: booking.status // Ready or Allocated
      };

      await db.bookings.add(remainingBooking);
      await db.sync_queue.add({
        table: 'bookings',
        action: 'INSERT',
        payload: remainingBooking,
        created_at: Date.now()
      });

      // 2. Adjust Allotments: split allotment associated with this booking
      const originalAllotments = await db.allotments.where('booking_id').equals(bookingId).toArray();
      let remainingToAllot = remainingQty;
      for (const allot of originalAllotments) {
        if (remainingToAllot <= 0) break;
        const take = Math.min(allot.quantity, remainingToAllot);
        remainingToAllot -= take;

        // Create new allotment for the remaining booking row
        const newAllotment = {
          id: generateId(),
          booking_id: newBookingId,
          lot_id: allot.lot_id,
          quantity: take,
          allotted_by: userId,
          allotted_at: new Date().toISOString(),
          sync_status: 'pending' as const
        };
        await db.allotments.add(newAllotment);
        await db.sync_queue.add({
          table: 'allotments',
          action: 'INSERT',
          payload: newAllotment,
          created_at: Date.now()
        });

        // Update old allotment quantity
        if (allot.quantity === take) {
          await db.allotments.delete(allot.id);
          await db.sync_queue.add({
            table: 'allotments',
            action: 'DELETE',
            payload: { id: allot.id },
            created_at: Date.now()
          });
        } else {
          const updatedAllot = { ...allot, quantity: allot.quantity - take, sync_status: 'pending' as const };
          await db.allotments.put(updatedAllot);
          await db.sync_queue.add({
            table: 'allotments',
            action: 'UPDATE',
            payload: { ...updatedAllot, sync_status: undefined },
            created_at: Date.now()
          });
        }
      }

      // 3. Update the original booking to represent the delivered quantity
      const deliveredUpdates = {
        quantity: deliverQty,
        total_amount: deliveredAmount,
        advance_paid: deliveredAdvance,
        advance_cash_amount: deliveredCash,
        advance_upi_amount: deliveredUpi,
        status: 'Delivered' as const,
        delivery_date: new Date().toISOString().split('T')[0],
        sync_status: 'pending' as const
      };
      await db.bookings.update(bookingId, deliveredUpdates);
      await db.sync_queue.add({
        table: 'bookings',
        action: 'UPDATE',
        payload: { ...booking, ...deliveredUpdates, sync_status: undefined },
        created_at: Date.now()
      });
    } else {
      // Full delivery
      const deliveredUpdates = {
        status: 'Delivered' as const,
        delivery_date: new Date().toISOString().split('T')[0],
        sync_status: 'pending' as const
      };
      await db.bookings.update(bookingId, deliveredUpdates);
      await db.sync_queue.add({
        table: 'bookings',
        action: 'UPDATE',
        payload: { ...booking, ...deliveredUpdates, sync_status: undefined },
        created_at: Date.now()
      });
    }

    await logAudit(userId, userName, 'DELIVER_BOOKING', 'bookings', bookingId, {
      qty_delivered: deliverQty,
      is_partial: isPartial,
      booking_number: booking.booking_number
    });
  });
}

export function toLocalDateStr(dateInput?: string | Date | number): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  } catch (e) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}

export { db };
