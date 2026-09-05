-- ==============================================================================
-- SHIVKUSH NURSERY MANAGEMENT SYSTEM (SNMS) - AUTHORITATIVE DATABASE SCHEMA SNAPSHOT
-- Plant-Level Inventory System (Lots & Allotments completely removed)
-- Generated automatically from live Supabase PostgreSQL schema
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS
DO $$ BEGIN
    CREATE TYPE booking_payment_type AS ENUM ('ADVANCE', 'FINAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_mode_type AS ENUM ('Cash', 'UPI', 'Split');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    mobile TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'worker')),
    password_hash TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. PLANTS TABLE (Authoritative living physical stock)
CREATE TABLE IF NOT EXISTS public.plants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plant_name TEXT NOT NULL,
    variety TEXT NOT NULL,
    category TEXT DEFAULT 'Other' NOT NULL,
    total_stock NUMERIC DEFAULT 0 NOT NULL CHECK (total_stock >= 0),
    selling_price DECIMAL(10,2) NOT NULL,
    pricing_tiers JSONB,
    description TEXT,
    active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- 5. STOCK ADJUSTMENTS TABLE (Immutable stock delta audit)
CREATE TABLE IF NOT EXISTS public.stock_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plant_id UUID NOT NULL REFERENCES public.plants(id) ON DELETE RESTRICT,
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('WASTAGE', 'LOSS', 'CORRECTION', 'ADDITION', 'INITIAL')),
    quantity_delta NUMERIC NOT NULL,
    reason TEXT NOT NULL,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    mobile TEXT UNIQUE NOT NULL,
    city TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- 7. BOOKINGS TABLE
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_number TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    city TEXT,
    plant_id UUID NOT NULL REFERENCES public.plants(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    advance_paid DECIMAL(10,2) DEFAULT 0 NOT NULL,
    advance_payment_mode TEXT,
    advance_cash_amount DECIMAL(10,2),
    advance_upi_amount DECIMAL(10,2),
    total_amount DECIMAL(10,2) NOT NULL,
    booking_date DATE DEFAULT CURRENT_DATE NOT NULL,
    delivery_date DATE,
    status TEXT NOT NULL CHECK (status IN ('Pending', 'Allocated', 'Ready', 'Delivered', 'Cancelled')),
    remarks TEXT,
    payment_mode TEXT,
    cash_amount DECIMAL(10,2),
    upi_amount DECIMAL(10,2),
    worker_id UUID REFERENCES public.users(id),
    assigned_to UUID REFERENCES public.users(id),
    refund_amount DECIMAL(10,2) DEFAULT 0,
    refund_payment_mode TEXT,
    refund_status TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- 8. BOOKING PAYMENTS TABLE (Immutable financial ledger for bookings)
CREATE TABLE IF NOT EXISTS public.booking_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    payment_type booking_payment_type NOT NULL,
    cash_amount DECIMAL(10,2) DEFAULT 0 NOT NULL,
    upi_amount DECIMAL(10,2) DEFAULT 0 NOT NULL,
    payment_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. DIRECT SALES TABLE
CREATE TABLE IF NOT EXISTS public.direct_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_number TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    plant_id UUID NOT NULL REFERENCES public.plants(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    payment_mode TEXT NOT NULL,
    cash_amount DECIMAL(10,2),
    upi_amount DECIMAL(10,2),
    worker_id UUID REFERENCES public.users(id) NOT NULL,
    assigned_to UUID REFERENCES public.users(id),
    fulfillment_status TEXT CHECK (fulfillment_status IN ('Pending Handover', 'Fulfilled')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- 10. EXPENSES TABLE
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL,
    description TEXT,
    payment_mode payment_mode_type NOT NULL DEFAULT 'Cash',
    expense_date DATE DEFAULT CURRENT_DATE NOT NULL,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. PAYMENT QRS TABLE
CREATE TABLE IF NOT EXISTS public.payment_qrs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    upi_id TEXT NOT NULL,
    image_data TEXT,
    active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 12. ATTENDANCE TABLE
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID REFERENCES public.users(id) NOT NULL,
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Half Day')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 13. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    user_name TEXT,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- AUTHORITATIVE VIEWS
-- ==============================================================================

-- View: vw_inventory_status
CREATE OR REPLACE VIEW public.vw_inventory_status AS
SELECT
    p.id AS plant_id,
    p.plant_name,
    p.variety,
    p.category,
    p.total_stock AS current_physical_stock,
    COALESCE(b.booked_qty, 0::bigint)::integer AS allocated_quantity,
    (p.total_stock - COALESCE(b.booked_qty, 0::bigint))::integer AS free_stock,
    p.selling_price,
    p.active
FROM public.plants p
LEFT JOIN (
    SELECT
        bookings.plant_id,
        sum(bookings.quantity) AS booked_qty
    FROM public.bookings
    WHERE bookings.deleted_at IS NULL
      AND bookings.status IN ('Pending', 'Allocated', 'Ready')
    GROUP BY bookings.plant_id
) b ON p.id = b.plant_id
WHERE p.deleted_at IS NULL;

-- View: vw_active_workers (Protects password hashes)
CREATE OR REPLACE VIEW public.vw_active_workers AS
SELECT id, name, role, mobile
FROM public.users
WHERE active = true;

-- View: vw_booking_status
CREATE OR REPLACE VIEW public.vw_booking_status AS
SELECT
    b.id AS booking_id,
    b.status AS booking_status,
    COALESCE(sum(CASE WHEN bp.payment_type = 'ADVANCE' THEN bp.cash_amount + bp.upi_amount ELSE 0 END), 0::numeric) AS advance_paid,
    COALESCE(sum(CASE WHEN bp.payment_type = 'FINAL' THEN bp.cash_amount + bp.upi_amount ELSE 0 END), 0::numeric) AS final_paid,
    COALESCE(sum(bp.cash_amount + bp.upi_amount), 0::numeric) AS total_paid,
    (b.total_amount - COALESCE(sum(bp.cash_amount + bp.upi_amount), 0::numeric)) AS outstanding_balance
FROM public.bookings b
LEFT JOIN public.booking_payments bp ON b.id = bp.booking_id
WHERE b.deleted_at IS NULL
GROUP BY b.id, b.status, b.total_amount;

-- View: vw_daily_cashbook
CREATE OR REPLACE VIEW public.vw_daily_cashbook AS
SELECT
    min(bp.payment_date) AS datetime,
    'BOOKING_PAYMENT'::text AS transaction_type,
    sum(bp.cash_amount) AS cash,
    sum(bp.upi_amount) AS upi,
    sum(bp.cash_amount + bp.upi_amount) AS total,
    ('Booking '::text || bp.payment_type || ' #'::text || b.booking_number || COALESCE(' ('::text || NULLIF(min(b.customer_name), ''::text) || ')'::text, ''::text)) AS description,
    bp.created_by AS worker_id,
    min(u.name) AS worker_name,
    b.booking_number AS reference_number
FROM public.booking_payments bp
JOIN public.bookings b ON bp.booking_id = b.id
LEFT JOIN public.users u ON bp.created_by = u.id
WHERE b.deleted_at IS NULL
GROUP BY b.booking_number, bp.payment_type, bp.payment_date, bp.created_by
UNION ALL
SELECT
    min(ds.created_at) AS datetime,
    'DIRECT_SALE'::text AS transaction_type,
    sum(COALESCE(ds.cash_amount, CASE WHEN ds.payment_mode = 'Cash' THEN ds.amount ELSE 0 END)) AS cash,
    sum(COALESCE(ds.upi_amount, CASE WHEN ds.payment_mode = 'UPI' THEN ds.amount ELSE 0 END)) AS upi,
    sum(ds.amount) AS total,
    ('Direct Sale #'::text || ds.sale_number || COALESCE(' ('::text || NULLIF(min(ds.customer_name), ''::text) || ')'::text, ''::text) ||
        CASE WHEN count(*) > 1 THEN ' - '::text || count(*) || ' items'::text ELSE ''::text END) AS description,
    ds.worker_id,
    min(u.name) AS worker_name,
    ds.sale_number AS reference_number
FROM public.direct_sales ds
LEFT JOIN public.users u ON ds.worker_id = u.id
WHERE ds.deleted_at IS NULL
GROUP BY ds.sale_number, ds.worker_id
UNION ALL
SELECT
    e.expense_date::timestamptz AS datetime,
    'EXPENSE'::text AS transaction_type,
    CASE WHEN e.payment_mode = 'Cash' THEN (- e.amount) ELSE 0 END AS cash,
    CASE WHEN e.payment_mode = 'UPI' THEN (- e.amount) ELSE 0 END AS upi,
    (- e.amount) AS total,
    ('Expense: '::text || e.category || COALESCE(' - '::text || e.description, ''::text)) AS description,
    e.created_by AS worker_id,
    u.name AS worker_name,
    e.id::text AS reference_number
FROM public.expenses e
LEFT JOIN public.users u ON e.created_by = u.id;

-- View: vw_profit_summary
CREATE OR REPLACE VIEW public.vw_profit_summary AS
SELECT
    datetime::date AS date,
    sum(CASE WHEN total > 0 THEN total ELSE 0 END) AS revenue,
    sum(CASE WHEN total < 0 THEN abs(total) ELSE 0 END) AS expenses,
    sum(total) AS profit
FROM public.vw_daily_cashbook
GROUP BY (datetime::date)
ORDER BY (datetime::date) DESC;
