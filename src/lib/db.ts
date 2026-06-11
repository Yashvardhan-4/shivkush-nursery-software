import Dexie, { type EntityTable } from 'dexie';

// =========================================
// INTERFACES
// =========================================

export interface Plant {
  id: string;
  plant_name: string;
  variety: string;       // e.g. "Grafted", "Seedling"
  category?: string;
  selling_price: number;
  active: boolean;
}

export interface Lot {
  id: string;
  lot_number: string;
  plant_id: string;
  total_quantity: number;
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
  quantity: number;
  amount: number;
  payment_mode: 'Cash' | 'UPI' | 'Split';
  cash_amount?: number;   // filled when mode is Cash or Split
  upi_amount?: number;    // filled when mode is UPI or Split
  worker_id: string;
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
  const totalStock = lots.reduce((sum, l) => sum + l.total_quantity, 0);

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

export function toLocalDateStr(dateInput?: string | Date | number): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export { db };
