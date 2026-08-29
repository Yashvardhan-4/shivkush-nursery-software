-- ENABLE UUID EXTENSION
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- DROP EXISTING TABLES AND FUNCTIONS (CLEARS ALL SCHEMA AND DATA)
DROP FUNCTION IF EXISTS process_sync_batch(json);
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.attendance CASCADE;
DROP TABLE IF EXISTS public.direct_sales CASCADE;
DROP TABLE IF EXISTS public.allotments CASCADE;
DROP TABLE IF EXISTS public.bookings CASCADE;
DROP TABLE IF EXISTS public.stock_adjustments CASCADE;
DROP TABLE IF EXISTS public.lots CASCADE;
DROP TABLE IF EXISTS public.plants CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.payment_qrs CASCADE;

-- CREATE TABLES

-- USERS TABLE
CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  mobile text UNIQUE NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'worker')),
  password_hash text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- PLANTS TABLE
CREATE TABLE public.plants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plant_name text NOT NULL,
  variety text NOT NULL,
  category text,
  selling_price decimal(10,2) NOT NULL,
  description text,
  active boolean DEFAULT true,
  pricing_tiers jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- LOTS TABLE
CREATE TABLE public.lots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lot_number text UNIQUE NOT NULL,
  lot_name text,
  plant_id uuid REFERENCES public.plants(id) ON DELETE CASCADE NOT NULL,
  total_quantity integer NOT NULL CHECK (total_quantity >= 0),
  initial_quantity integer NOT NULL DEFAULT 0,
  ready_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('Growing', 'Ready', 'Completed')),
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- STOCK ADJUSTMENTS TABLE
CREATE TABLE public.stock_adjustments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lot_id uuid REFERENCES public.lots(id) ON DELETE CASCADE NOT NULL,
  quantity_change integer NOT NULL CHECK (quantity_change != 0),
  previous_quantity integer NOT NULL CHECK (previous_quantity >= 0),
  new_quantity integer NOT NULL CHECK (new_quantity >= 0),
  reason text NOT NULL CHECK (reason IN ('MORTALITY', 'RECOUNT_SHORTAGE', 'RECOUNT_SURPLUS', 'DAMAGE', 'OTHER')),
  remarks text,
  performed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- BOOKINGS TABLE
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_number text NOT NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  city text,
  plant_id uuid REFERENCES public.plants(id) ON DELETE CASCADE NOT NULL,
  lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  advance_paid decimal(10,2) DEFAULT 0,
  advance_payment_mode text CHECK (advance_payment_mode IN ('Cash', 'UPI', 'Split')),
  advance_cash_amount decimal(10,2),
  advance_upi_amount decimal(10,2),
  total_amount decimal(10,2) NOT NULL,
  booking_date date DEFAULT CURRENT_DATE NOT NULL,
  delivery_date date,
  status text NOT NULL CHECK (status IN ('Pending', 'Allocated', 'Ready', 'Delivered', 'Cancelled')),
  remarks text,
  payment_mode text CHECK (payment_mode IN ('Cash', 'UPI', 'Split')),
  cash_amount decimal(10,2),
  upi_amount decimal(10,2),
  worker_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  refund_amount decimal(10,2) DEFAULT 0,
  refund_payment_mode text CHECK (refund_payment_mode IN ('Cash', 'UPI')),
  refund_status text DEFAULT 'Not Refunded' CHECK (refund_status IN ('Not Refunded', 'Refunded', 'Forfeited')),
  refund_date date
);

-- ALLOTMENTS TABLE
CREATE TABLE public.allotments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  lot_id uuid REFERENCES public.lots(id) ON DELETE CASCADE NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  allotted_by uuid REFERENCES public.users(id) ON DELETE SET NULL NOT NULL,
  allotted_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- DIRECT SALES TABLE
CREATE TABLE public.direct_sales (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_number text NOT NULL,
  customer_name text,
  customer_phone text,
  plant_id uuid REFERENCES public.plants(id) ON DELETE CASCADE NOT NULL,
  lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  amount decimal(10,2) NOT NULL CHECK (amount > 0),
  payment_mode text NOT NULL CHECK (payment_mode IN ('Cash', 'UPI', 'Split')),
  cash_amount decimal(10,2),
  upi_amount decimal(10,2),
  worker_id uuid REFERENCES public.users(id) ON DELETE SET NULL NOT NULL,
  assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
  fulfillment_status text CHECK (fulfillment_status IN ('Pending Handover', 'Fulfilled')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ATTENDANCE TABLE
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  date date DEFAULT CURRENT_DATE NOT NULL,
  status text NOT NULL CHECK (status IN ('Present', 'Absent', 'Half Day')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT unique_worker_date UNIQUE(worker_id, date)
);

-- AUDIT LOGS TABLE
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  user_name text,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  details text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- CUSTOMERS TABLE
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  mobile text UNIQUE NOT NULL,
  city text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- PAYMENT QRS TABLE
CREATE TABLE public.payment_qrs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  upi_id text NOT NULL,
  image_data text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- INDEXES FOR FOREIGN KEYS
CREATE INDEX idx_lots_plant_id ON public.lots(plant_id);
CREATE INDEX idx_stock_adjustments_lot_id ON public.stock_adjustments(lot_id);
CREATE INDEX idx_bookings_plant_id ON public.bookings(plant_id);
CREATE INDEX idx_bookings_lot_id ON public.bookings(lot_id);
CREATE INDEX idx_bookings_worker_id ON public.bookings(worker_id);
CREATE INDEX idx_bookings_assigned_to ON public.bookings(assigned_to);
CREATE INDEX idx_allotments_booking_id ON public.allotments(booking_id);
CREATE INDEX idx_allotments_lot_id ON public.allotments(lot_id);
CREATE INDEX idx_allotments_allotted_by ON public.allotments(allotted_by);
CREATE INDEX idx_direct_sales_plant_id ON public.direct_sales(plant_id);
CREATE INDEX idx_direct_sales_lot_id ON public.direct_sales(lot_id);
CREATE INDEX idx_direct_sales_worker_id ON public.direct_sales(worker_id);
CREATE INDEX idx_direct_sales_assigned_to ON public.direct_sales(assigned_to);
CREATE INDEX idx_attendance_worker_id ON public.attendance(worker_id);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);

-- ROW LEVEL SECURITY (RLS) SETTINGS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allotments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_qrs ENABLE ROW LEVEL SECURITY;

-- Note: RLS is active but no public policies are added. Access is restricted to service_role (Admin) via server API routes.

-- UPDATED_AT AUTO UPDATE TRIGGERS
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_plants_updated_at BEFORE UPDATE ON public.plants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lots_updated_at BEFORE UPDATE ON public.lots FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_allotments_updated_at BEFORE UPDATE ON public.allotments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_direct_sales_updated_at BEFORE UPDATE ON public.direct_sales FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_audit_logs_updated_at BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_qrs_updated_at BEFORE UPDATE ON public.payment_qrs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- PROCESS SYNC BATCH RPC FUNCTION (Supports all tables and properties)
CREATE OR REPLACE FUNCTION process_sync_batch(payload JSON)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
    item JSON;
    act TEXT;
    tbl TEXT;
    item_id UUID;
    p JSON;
BEGIN
    FOR item IN SELECT * FROM json_array_elements(payload)
    LOOP
        act := item->>'action';
        tbl := item->>'table';
        p := item->'payload';
        
        IF tbl = 'audit_logs' THEN
            item_id := NULL;
        ELSE
            item_id := NULLIF(p->>'id', '')::uuid;
        END IF;

        IF tbl = 'plants' THEN
            IF act = 'INSERT' THEN
                INSERT INTO public.plants (id, plant_name, variety, category, selling_price, description, active, pricing_tiers, created_at)
                VALUES (
                    COALESCE(item_id, uuid_generate_v4()),
                    p->>'plant_name',
                    p->>'variety',
                    p->>'category',
                    (p->>'selling_price')::decimal,
                    p->>'description',
                    COALESCE((p->>'active')::boolean, true),
                    COALESCE(p->'pricing_tiers', '[]'::json),
                    COALESCE(NULLIF(p->>'created_at','')::timestamp with time zone, now())
                ) ON CONFLICT (id) DO UPDATE SET
                    plant_name = EXCLUDED.plant_name,
                    variety = EXCLUDED.variety,
                    category = EXCLUDED.category,
                    selling_price = EXCLUDED.selling_price,
                    description = EXCLUDED.description,
                    pricing_tiers = EXCLUDED.pricing_tiers,
                    active = EXCLUDED.active;
            ELSIF act = 'UPDATE' THEN
                UPDATE public.plants SET
                    plant_name = COALESCE(p->>'plant_name', plant_name),
                    variety = COALESCE(p->>'variety', variety),
                    category = COALESCE(p->>'category', category),
                    selling_price = COALESCE((p->>'selling_price')::decimal, selling_price),
                    description = COALESCE(p->>'description', description),
                    pricing_tiers = COALESCE(p->'pricing_tiers', pricing_tiers),
                    active = COALESCE((p->>'active')::boolean, active),
                    deleted_at = COALESCE(NULLIF(p->>'deleted_at', '')::timestamp with time zone, deleted_at)
                WHERE id = item_id;
            ELSIF act = 'DELETE' THEN
                DELETE FROM public.plants WHERE id = item_id;
            END IF;

        ELSIF tbl = 'customers' THEN
            IF act = 'INSERT' THEN
                INSERT INTO public.customers (id, name, mobile, city, created_at)
                VALUES (
                    COALESCE(item_id, uuid_generate_v4()),
                    p->>'name',
                    p->>'mobile',
                    p->>'city',
                    COALESCE(NULLIF(p->>'created_at','')::timestamp with time zone, now())
                ) ON CONFLICT (mobile) DO UPDATE SET
                    name = EXCLUDED.name,
                    city = EXCLUDED.city;
            ELSIF act = 'UPDATE' THEN
                UPDATE public.customers SET
                    name = COALESCE(p->>'name', name),
                    mobile = COALESCE(p->>'mobile', mobile),
                    city = COALESCE(p->>'city', city),
                    deleted_at = COALESCE(NULLIF(p->>'deleted_at', '')::timestamp with time zone, deleted_at)
                WHERE id = item_id;
            ELSIF act = 'DELETE' THEN
                DELETE FROM public.customers WHERE id = item_id;
            END IF;

        ELSIF tbl = 'lots' THEN
            IF act = 'INSERT' THEN
                INSERT INTO public.lots (id, lot_number, lot_name, plant_id, total_quantity, initial_quantity, available_stock, ready_date, status, notes, created_at)
                VALUES (
                    COALESCE(item_id, uuid_generate_v4()),
                    p->>'lot_number',
                    p->>'lot_name',
                    (p->>'plant_id')::uuid,
                    (p->>'total_quantity')::integer,
                    COALESCE((p->>'initial_quantity')::integer, (p->>'total_quantity')::integer),
                    COALESCE((p->>'available_stock')::integer, (p->>'total_quantity')::integer),
                    COALESCE(NULLIF(p->>'ready_date', '')::date, CURRENT_DATE),
                    p->>'status',
                    p->>'notes',
                    COALESCE(NULLIF(p->>'created_at','')::timestamp with time zone, now())
                ) ON CONFLICT (id) DO UPDATE SET
                    lot_number = EXCLUDED.lot_number,
                    lot_name = EXCLUDED.lot_name,
                    plant_id = EXCLUDED.plant_id,
                    total_quantity = EXCLUDED.total_quantity,
                    initial_quantity = EXCLUDED.initial_quantity,
                    available_stock = EXCLUDED.available_stock,
                    ready_date = EXCLUDED.ready_date,
                    status = EXCLUDED.status,
                    notes = EXCLUDED.notes;
            ELSIF act = 'UPDATE' THEN
                UPDATE public.lots SET
                    lot_number = COALESCE(p->>'lot_number', lot_number),
                    lot_name = COALESCE(p->>'lot_name', lot_name),
                    plant_id = COALESCE((p->>'plant_id')::uuid, plant_id),
                    total_quantity = COALESCE((p->>'total_quantity')::integer, total_quantity),
                    initial_quantity = COALESCE((p->>'initial_quantity')::integer, initial_quantity),
                    available_stock = COALESCE((p->>'available_stock')::integer, available_stock),
                    ready_date = COALESCE(NULLIF(p->>'ready_date', '')::date, ready_date),
                    status = COALESCE(p->>'status', status),
                    notes = COALESCE(p->>'notes', notes),
                    deleted_at = COALESCE(NULLIF(p->>'deleted_at', '')::timestamp with time zone, deleted_at)
                WHERE id = item_id;
            ELSIF act = 'DELETE' THEN
                DELETE FROM public.lots WHERE id = item_id;
            END IF;

        ELSIF tbl = 'bookings' THEN
            IF act = 'INSERT' THEN
                INSERT INTO public.bookings (
                    id, booking_number, customer_name, customer_phone, city,
                    plant_id, lot_id, quantity, advance_paid, advance_payment_mode,
                    advance_cash_amount, advance_upi_amount, total_amount,
                    booking_date, delivery_date, status, remarks,
                    payment_mode, cash_amount, upi_amount, worker_id, assigned_to, created_at,
                    refund_amount, refund_payment_mode, refund_status, refund_date
                ) VALUES (
                    COALESCE(item_id, uuid_generate_v4()),
                    p->>'booking_number',
                    p->>'customer_name',
                    p->>'customer_phone',
                    p->>'city',
                    (p->>'plant_id')::uuid,
                    NULLIF(p->>'lot_id', '')::uuid,
                    (p->>'quantity')::integer,
                    COALESCE((p->>'advance_paid')::decimal, 0),
                    p->>'advance_payment_mode',
                    NULLIF(p->>'advance_cash_amount', '')::decimal,
                    NULLIF(p->>'advance_upi_amount', '')::decimal,
                    (p->>'total_amount')::decimal,
                    COALESCE(NULLIF(p->>'booking_date', '')::date, CURRENT_DATE),
                    NULLIF(p->>'delivery_date', '')::date,
                    p->>'status',
                    p->>'remarks',
                    p->>'payment_mode',
                    NULLIF(p->>'cash_amount', '')::decimal,
                    NULLIF(p->>'upi_amount', '')::decimal,
                    NULLIF(p->>'worker_id', '')::uuid,
                    NULLIF(p->>'assigned_to', '')::uuid,
                    COALESCE(NULLIF(p->>'created_at','')::timestamp with time zone, now()),
                    COALESCE((p->>'refund_amount')::decimal, 0),
                    p->>'refund_payment_mode',
                    COALESCE(p->>'refund_status', 'Not Refunded'),
                    NULLIF(p->>'refund_date', '')::date
                ) ON CONFLICT (id) DO UPDATE SET
                    quantity = EXCLUDED.quantity,
                    advance_paid = EXCLUDED.advance_paid,
                    advance_payment_mode = EXCLUDED.advance_payment_mode,
                    advance_cash_amount = EXCLUDED.advance_cash_amount,
                    advance_upi_amount = EXCLUDED.advance_upi_amount,
                    total_amount = EXCLUDED.total_amount,
                    delivery_date = EXCLUDED.delivery_date,
                    status = EXCLUDED.status,
                    remarks = EXCLUDED.remarks,
                    payment_mode = EXCLUDED.payment_mode,
                    cash_amount = EXCLUDED.cash_amount,
                    upi_amount = EXCLUDED.upi_amount,
                    lot_id = EXCLUDED.lot_id,
                    assigned_to = EXCLUDED.assigned_to,
                    refund_amount = EXCLUDED.refund_amount,
                    refund_payment_mode = EXCLUDED.refund_payment_mode,
                    refund_status = EXCLUDED.refund_status,
                    refund_date = EXCLUDED.refund_date;
            ELSIF act = 'UPDATE' THEN
                UPDATE public.bookings SET
                    booking_number = COALESCE(p->>'booking_number', booking_number),
                    customer_name = COALESCE(p->>'customer_name', customer_name),
                    customer_phone = COALESCE(p->>'customer_phone', customer_phone),
                    city = COALESCE(p->>'city', city),
                    plant_id = COALESCE(NULLIF(p->>'plant_id', '')::uuid, plant_id),
                    lot_id = COALESCE(NULLIF(p->>'lot_id', '')::uuid, lot_id),
                    quantity = COALESCE(NULLIF(p->>'quantity', '')::integer, quantity),
                    advance_paid = COALESCE(NULLIF(p->>'advance_paid', '')::decimal, advance_paid),
                    advance_payment_mode = COALESCE(p->>'advance_payment_mode', advance_payment_mode),
                    advance_cash_amount = COALESCE(NULLIF(p->>'advance_cash_amount', '')::decimal, advance_cash_amount),
                    advance_upi_amount = COALESCE(NULLIF(p->>'advance_upi_amount', '')::decimal, advance_upi_amount),
                    total_amount = COALESCE(NULLIF(p->>'total_amount', '')::decimal, total_amount),
                    booking_date = COALESCE(NULLIF(p->>'booking_date', '')::date, booking_date),
                    delivery_date = CASE WHEN p->>'delivery_date' IS NOT NULL AND p->>'delivery_date' != '' THEN (p->>'delivery_date')::date ELSE delivery_date END,
                    status = COALESCE(p->>'status', status),
                    remarks = COALESCE(p->>'remarks', remarks),
                    payment_mode = COALESCE(p->>'payment_mode', payment_mode),
                    cash_amount = COALESCE(NULLIF(p->>'cash_amount', '')::decimal, cash_amount),
                    upi_amount = COALESCE(NULLIF(p->>'upi_amount', '')::decimal, upi_amount),
                    worker_id = COALESCE(NULLIF(p->>'worker_id', '')::uuid, worker_id),
                    assigned_to = COALESCE(NULLIF(p->>'assigned_to', '')::uuid, assigned_to),
                    refund_amount = COALESCE((p->>'refund_amount')::decimal, refund_amount),
                    refund_payment_mode = COALESCE(p->>'refund_payment_mode', refund_payment_mode),
                    refund_status = COALESCE(p->>'refund_status', refund_status),
                    refund_date = CASE WHEN p->>'refund_date' IS NOT NULL AND p->>'refund_date' != '' THEN (p->>'refund_date')::date ELSE refund_date END,
                    deleted_at = COALESCE(NULLIF(p->>'deleted_at', '')::timestamp with time zone, deleted_at)
                WHERE id = item_id;
            ELSIF act = 'DELETE' THEN
                DELETE FROM public.bookings WHERE id = item_id;
            END IF;

        ELSIF tbl = 'allotments' THEN
            IF act = 'INSERT' THEN
                INSERT INTO public.allotments (id, booking_id, lot_id, quantity, allotted_by, allotted_at)
                VALUES (
                    COALESCE(item_id, uuid_generate_v4()),
                    (p->>'booking_id')::uuid,
                    (p->>'lot_id')::uuid,
                    (p->>'quantity')::integer,
                    (p->>'allotted_by')::uuid,
                    COALESCE(NULLIF(p->>'allotted_at','')::timestamp with time zone, now())
                ) ON CONFLICT (id) DO NOTHING;
            ELSIF act = 'UPDATE' THEN
                UPDATE public.allotments SET
                    booking_id = COALESCE(NULLIF(p->>'booking_id', '')::uuid, booking_id),
                    lot_id = COALESCE(NULLIF(p->>'lot_id', '')::uuid, lot_id),
                    quantity = COALESCE(NULLIF(p->>'quantity', '')::integer, quantity),
                    allotted_by = COALESCE(NULLIF(p->>'allotted_by', '')::uuid, allotted_by),
                    allotted_at = COALESCE(NULLIF(p->>'allotted_at', '')::timestamp with time zone, allotted_at),
                    deleted_at = COALESCE(NULLIF(p->>'deleted_at', '')::timestamp with time zone, deleted_at)
                WHERE id = item_id;
            ELSIF act = 'DELETE' THEN
                DELETE FROM public.allotments WHERE id = item_id;
            END IF;

        ELSIF tbl = 'direct_sales' THEN
            IF act = 'INSERT' THEN
                INSERT INTO public.direct_sales (
                    id, sale_number, customer_name, customer_phone,
                    plant_id, lot_id, quantity, amount, payment_mode,
                    cash_amount, upi_amount, worker_id, assigned_to, fulfillment_status, created_at
                ) VALUES (
                    COALESCE(item_id, uuid_generate_v4()),
                    p->>'sale_number',
                    p->>'customer_name',
                    p->>'customer_phone',
                    (p->>'plant_id')::uuid,
                    NULLIF(p->>'lot_id', '')::uuid,
                    (p->>'quantity')::integer,
                    (p->>'amount')::decimal,
                    p->>'payment_mode',
                    NULLIF(p->>'cash_amount', '')::decimal,
                    NULLIF(p->>'upi_amount', '')::decimal,
                    (p->>'worker_id')::uuid,
                    NULLIF(p->>'assigned_to', '')::uuid,
                    p->>'fulfillment_status',
                    COALESCE(NULLIF(p->>'created_at','')::timestamp with time zone, now())
                ) ON CONFLICT (id) DO NOTHING;
            ELSIF act = 'UPDATE' THEN
                UPDATE public.direct_sales SET
                    sale_number = COALESCE(p->>'sale_number', sale_number),
                    customer_name = COALESCE(p->>'customer_name', customer_name),
                    customer_phone = COALESCE(p->>'customer_phone', customer_phone),
                    plant_id = COALESCE(NULLIF(p->>'plant_id', '')::uuid, plant_id),
                    lot_id = COALESCE(NULLIF(p->>'lot_id', '')::uuid, lot_id),
                    quantity = COALESCE(NULLIF(p->>'quantity', '')::integer, quantity),
                    amount = COALESCE(NULLIF(p->>'amount', '')::decimal, amount),
                    payment_mode = COALESCE(p->>'payment_mode', payment_mode),
                    cash_amount = COALESCE(NULLIF(p->>'cash_amount', '')::decimal, cash_amount),
                    upi_amount = COALESCE(NULLIF(p->>'upi_amount', '')::decimal, upi_amount),
                    worker_id = COALESCE(NULLIF(p->>'worker_id', '')::uuid, worker_id),
                    assigned_to = COALESCE(NULLIF(p->>'assigned_to', '')::uuid, assigned_to),
                    fulfillment_status = COALESCE(p->>'fulfillment_status', fulfillment_status),
                    deleted_at = COALESCE(NULLIF(p->>'deleted_at', '')::timestamp with time zone, deleted_at)
                WHERE id = item_id;
            ELSIF act = 'DELETE' THEN
                DELETE FROM public.direct_sales WHERE id = item_id;
            END IF;

        ELSIF tbl = 'attendance' THEN
            IF act = 'INSERT' THEN
                INSERT INTO public.attendance (id, worker_id, date, status, created_at)
                VALUES (
                    COALESCE(item_id, uuid_generate_v4()),
                    (p->>'worker_id')::uuid,
                    (p->>'date')::date,
                    p->>'status',
                    COALESCE(NULLIF(p->>'created_at','')::timestamp with time zone, now())
                ) ON CONFLICT (worker_id, date) DO UPDATE SET status = EXCLUDED.status, id = EXCLUDED.id;
            ELSIF act = 'UPDATE' THEN
                UPDATE public.attendance SET
                    worker_id = COALESCE(NULLIF(p->>'worker_id', '')::uuid, worker_id),
                    date = COALESCE(NULLIF(p->>'date', '')::date, date),
                    status = COALESCE(p->>'status', status),
                    deleted_at = COALESCE(NULLIF(p->>'deleted_at', '')::timestamp with time zone, deleted_at)
                WHERE id = item_id;
            ELSIF act = 'DELETE' THEN
                DELETE FROM public.attendance WHERE id = item_id;
            END IF;

        ELSIF tbl = 'payment_qrs' THEN
            IF act = 'INSERT' THEN
                INSERT INTO public.payment_qrs (id, name, upi_id, image_data, active, created_at)
                VALUES (
                    COALESCE(item_id, uuid_generate_v4()),
                    p->>'name',
                    p->>'upi_id',
                    p->>'image_data',
                    COALESCE((p->>'active')::boolean, true),
                    COALESCE(NULLIF(p->>'created_at','')::timestamp with time zone, now())
                ) ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    upi_id = EXCLUDED.upi_id,
                    image_data = EXCLUDED.image_data,
                    active = EXCLUDED.active;
            ELSIF act = 'UPDATE' THEN
                UPDATE public.payment_qrs SET
                    name = COALESCE(p->>'name', name),
                    upi_id = COALESCE(p->>'upi_id', upi_id),
                    image_data = COALESCE(p->>'image_data', image_data),
                    active = COALESCE((p->>'active')::boolean, active),
                    deleted_at = COALESCE(NULLIF(p->>'deleted_at', '')::timestamp with time zone, deleted_at)
                WHERE id = item_id;
            ELSIF act = 'DELETE' THEN
                DELETE FROM public.payment_qrs WHERE id = item_id;
            END IF;

        ELSIF tbl = 'audit_logs' THEN
            IF act = 'INSERT' THEN
                INSERT INTO public.audit_logs (id, user_id, user_name, action, table_name, record_id, details, created_at)
                VALUES (
                    uuid_generate_v4(),
                    (p->>'user_id')::uuid,
                    p->>'user_name',
                    p->>'action',
                    p->>'table_name',
                    p->>'record_id',
                    p->>'details',
                    COALESCE(NULLIF(p->>'created_at','')::timestamp with time zone, now())
                );
            END IF;
        END IF;
    END LOOP;
END;
$;


-- SEED AN INITIAL OWNER ACCOUNT
-- Mobile: 9999999999, Password: admin
-- You can log in with these credentials, go to Staff Management to create workers, and delete/modify this account as needed.
INSERT INTO public.users (id, name, mobile, role, password_hash)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Owner',
  '9999999999',
  'owner',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi' -- bcrypt hash of 'admin'
) ON CONFLICT (mobile) DO NOTHING;


-- 1. CENTRALIZED INVENTORY VIEW
CREATE OR REPLACE VIEW public.vw_inventory_status AS
WITH AllocationSums AS (
    SELECT 
        a.lot_id, 
        SUM(a.quantity) as qty
    FROM public.allotments a
    JOIN public.bookings b ON a.booking_id = b.id
    WHERE b.status IN ('Pending', 'Allocated', 'Ready')
    GROUP BY a.lot_id
),
DeliveredBookingSums AS (
    SELECT 
        lot_id, 
        SUM(quantity) as qty
    FROM public.bookings
    WHERE status = 'Delivered' AND lot_id IS NOT NULL
    GROUP BY lot_id
),
DeliveredAllotmentSums AS (
    SELECT 
        a.lot_id, 
        SUM(a.quantity) as qty
    FROM public.allotments a
    JOIN public.bookings b ON a.booking_id = b.id
    WHERE b.status = 'Delivered' AND b.lot_id IS NULL
    GROUP BY a.lot_id
),
DirectSaleSums AS (
    SELECT 
        lot_id, 
        SUM(quantity) as qty
    FROM public.direct_sales
    GROUP BY lot_id
)
SELECT 
    l.id AS lot_id,
    l.initial_quantity AS produced_quantity,
    l.total_quantity AS survived_quantity,
    COALESCE(als.qty, 0) AS allocated_quantity,
    COALESCE(dbs.qty, 0) + COALESCE(das.qty, 0) + COALESCE(dss.qty, 0) AS sold_quantity,
    (l.total_quantity - (COALESCE(dbs.qty, 0) + COALESCE(das.qty, 0) + COALESCE(dss.qty, 0))) AS current_physical_stock,
    (l.total_quantity - COALESCE(als.qty, 0) - (COALESCE(dbs.qty, 0) + COALESCE(das.qty, 0) + COALESCE(dss.qty, 0))) AS free_stock,
    l.status
FROM public.lots l
LEFT JOIN AllocationSums als ON l.id = als.lot_id
LEFT JOIN DeliveredBookingSums dbs ON l.id = dbs.lot_id
LEFT JOIN DeliveredAllotmentSums das ON l.id = das.lot_id
LEFT JOIN DirectSaleSums dss ON l.id = dss.lot_id;


-- 2. RPC: ADJUST LOT QUANTITY
CREATE OR REPLACE FUNCTION rpc_adjust_lot_quantity(
    p_lot_id uuid,
    p_new_quantity integer,
    p_reason text,
    p_remarks text,
    p_user_id uuid
) RETURNS json AS $$
DECLARE
    v_lot record;
    v_inventory record;
    v_delta integer;
BEGIN
    -- Pessimistic Lock
    SELECT * INTO v_lot FROM public.lots WHERE id = p_lot_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Lot not found');
    END IF;

    -- Retrieve strictly calculated allocated/sold state from view
    SELECT * INTO v_inventory FROM public.vw_inventory_status WHERE lot_id = p_lot_id;

    -- Calculate Delta
    v_delta := p_new_quantity - v_lot.total_quantity;

    IF v_delta = 0 THEN
        RETURN json_build_object('success', false, 'error', 'No change in quantity');
    END IF;

    -- Validate via Inventory Mathematics v1.0 constraints
    -- New Survived >= Allocated + Sold
    IF p_new_quantity < (v_inventory.allocated_quantity + v_inventory.sold_quantity) THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'New quantity ' || p_new_quantity || ' is less than active allocations + sales (' || (v_inventory.allocated_quantity + v_inventory.sold_quantity) || ').'
        );
    END IF;

    -- Insert Audit Log
    INSERT INTO public.stock_adjustments (
        lot_id, quantity_change, previous_quantity, new_quantity, reason, remarks, performed_by
    ) VALUES (
        p_lot_id, v_delta, v_lot.total_quantity, p_new_quantity, p_reason, p_remarks, p_user_id
    );

    -- Update Lot
    UPDATE public.lots 
    SET total_quantity = p_new_quantity, updated_at = NOW() 
    WHERE id = p_lot_id;

    RETURN json_build_object('success', true, 'lot_id', p_lot_id, 'new_quantity', p_new_quantity);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. RPC: REGISTER TRANSACTION
CREATE OR REPLACE FUNCTION rpc_register_transaction(
    p_booking_id uuid,
    p_payment_type text, -- 'advance' or 'final'
    p_payments jsonb -- '[{"mode": "Cash", "amount": 100}, {"mode": "UPI", "amount": 50}]'
) RETURNS json AS $$
DECLARE
    v_booking record;
    v_cash_amt decimal(10,2) := 0;
    v_upi_amt decimal(10,2) := 0;
    v_total_payment decimal(10,2) := 0;
    v_mode text;
    v_payment jsonb;
BEGIN
    -- Pessimistic Lock on Booking
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Booking not found');
    END IF;

    -- Calculate Totals from Array
    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        IF v_payment->>'mode' = 'Cash' THEN
            v_cash_amt := v_cash_amt + (v_payment->>'amount')::decimal;
        ELSIF v_payment->>'mode' = 'UPI' THEN
            v_upi_amt := v_upi_amt + (v_payment->>'amount')::decimal;
        END IF;
    END LOOP;

    v_total_payment := v_cash_amt + v_upi_amt;

    IF v_cash_amt > 0 AND v_upi_amt > 0 THEN
        v_mode := 'Split';
    ELSIF v_upi_amt > 0 THEN
        v_mode := 'UPI';
    ELSIF v_cash_amt > 0 THEN
        v_mode := 'Cash';
    ELSE
        v_mode := NULL;
    END IF;

    -- Security Validation (Prevent Overpayment)
    -- IF p_payment_type = 'final' AND v_total_payment > (v_booking.total_amount - COALESCE(v_booking.advance_paid, 0)) THEN
    --    RETURN json_build_object('success', false, 'error', 'Payment exceeds outstanding balance');
    -- END IF;

    -- Update Booking State Atomically
    IF p_payment_type = 'advance' THEN
        UPDATE public.bookings SET
            advance_paid = v_total_payment,
            advance_payment_mode = v_mode,
            advance_cash_amount = v_cash_amt,
            advance_upi_amount = v_upi_amt,
            updated_at = NOW()
        WHERE id = p_booking_id;
    ELSIF p_payment_type = 'final' THEN
        UPDATE public.bookings SET
            payment_mode = v_mode,
            cash_amount = v_cash_amt,
            upi_amount = v_upi_amt,
            updated_at = NOW()
        WHERE id = p_booking_id;
    ELSE
        RETURN json_build_object('success', false, 'error', 'Invalid payment type. Must be advance or final.');
    END IF;

    RETURN json_build_object('success', true, 'booking_id', p_booking_id, 'total_recorded', v_total_payment);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 1. CENTRALIZED INVENTORY VIEW
CREATE OR REPLACE VIEW public.vw_inventory_status AS
WITH AllocationSums AS (
    SELECT 
        a.lot_id, 
        SUM(a.quantity) as qty
    FROM public.allotments a
    JOIN public.bookings b ON a.booking_id = b.id
    WHERE b.status IN ('Pending', 'Allocated', 'Ready')
    GROUP BY a.lot_id
),
DeliveredBookingSums AS (
    -- SPRINT 3 MIGRATION NOTE: This CTE relies on booking status for deliveries.
    -- In Sprint 3, this must be rewritten to sum `quantity` from the future `delivery_line_items` table.
    SELECT 
        lot_id, 
        SUM(quantity) as qty
    FROM public.bookings
    WHERE status = 'Delivered' AND lot_id IS NOT NULL
    GROUP BY lot_id
),
DeliveredAllotmentSums AS (
    -- SPRINT 3 MIGRATION NOTE: This CTE relies on booking status for deliveries.
    -- In Sprint 3, this must be rewritten to sum `quantity` from the future `delivery_line_items` table.
    SELECT 
        a.lot_id, 
        SUM(a.quantity) as qty
    FROM public.allotments a
    JOIN public.bookings b ON a.booking_id = b.id
    WHERE b.status = 'Delivered' AND b.lot_id IS NULL
    GROUP BY a.lot_id
),
DirectSaleSums AS (
    SELECT 
        lot_id, 
        SUM(quantity) as qty
    FROM public.direct_sales
    GROUP BY lot_id
)
SELECT 
    l.id AS lot_id,
    l.initial_quantity AS produced_quantity,
    l.total_quantity AS survived_quantity,
    COALESCE(als.qty, 0) AS allocated_quantity,
    
    -- SPRINT 3 MIGRATION NOTE: Current sold calculation = Direct Sales + Delivered Bookings (via status check).
    -- Future sold calculation = Direct Sales + Sum of delivery_line_items.
    COALESCE(dbs.qty, 0) + COALESCE(das.qty, 0) + COALESCE(dss.qty, 0) AS sold_quantity,
    
    (l.total_quantity - (COALESCE(dbs.qty, 0) + COALESCE(das.qty, 0) + COALESCE(dss.qty, 0))) AS current_physical_stock,
    (l.total_quantity - COALESCE(als.qty, 0) - (COALESCE(dbs.qty, 0) + COALESCE(das.qty, 0) + COALESCE(dss.qty, 0))) AS free_stock,
    l.status
FROM public.lots l
LEFT JOIN AllocationSums als ON l.id = als.lot_id
LEFT JOIN DeliveredBookingSums dbs ON l.id = dbs.lot_id
LEFT JOIN DeliveredAllotmentSums das ON l.id = das.lot_id
LEFT JOIN DirectSaleSums dss ON l.id = dss.lot_id;


-- 2. RPC: ADJUST LOT QUANTITY
CREATE OR REPLACE FUNCTION rpc_adjust_lot_quantity(
    p_lot_id uuid,
    p_new_quantity integer,
    p_reason text,
    p_remarks text,
    p_user_id uuid,
    p_expected_updated_at timestamp with time zone
) RETURNS json 
SET search_path = public, pg_temp
SECURITY DEFINER
AS $$
DECLARE
    v_lot record;
    v_inventory record;
    v_delta integer;
    v_caller_uid uuid;
BEGIN
    -- Authorization Check
    -- (Assuming auth.uid() returns the authenticated user if called via API)
    v_caller_uid := auth.uid();
    -- Allow bypass if called internally via postgres role (like in tests/mcp)
    IF v_caller_uid IS NULL AND current_setting('role') != 'postgres' THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized: User must be authenticated');
    END IF;

    -- Pessimistic Lock
    SELECT * INTO v_lot FROM public.lots WHERE id = p_lot_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Lot not found');
    END IF;

    -- Optimistic Concurrency Control (OCC)
    IF v_lot.updated_at != p_expected_updated_at THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'Concurrency Error: Lot was modified by another user. Please refresh and try again.', 
            'current_updated_at', v_lot.updated_at
        );
    END IF;

    -- Retrieve strictly calculated allocated/sold state from view
    SELECT * INTO v_inventory FROM public.vw_inventory_status WHERE lot_id = p_lot_id;

    -- Calculate Delta
    v_delta := p_new_quantity - v_lot.total_quantity;

    IF v_delta = 0 THEN
        RETURN json_build_object('success', false, 'error', 'No change in quantity');
    END IF;

    -- Validate via Inventory Mathematics v1.0 constraints
    IF p_new_quantity < (v_inventory.allocated_quantity + v_inventory.sold_quantity) THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'New quantity ' || p_new_quantity || ' is less than active allocations + sales (' || (v_inventory.allocated_quantity + v_inventory.sold_quantity) || ').'
        );
    END IF;

    -- Insert Audit Log
    INSERT INTO public.stock_adjustments (
        lot_id, quantity_change, previous_quantity, new_quantity, reason, remarks, performed_by
    ) VALUES (
        p_lot_id, v_delta, v_lot.total_quantity, p_new_quantity, p_reason, p_remarks, COALESCE(v_caller_uid, p_user_id)
    );

    -- Update Lot
    UPDATE public.lots 
    SET total_quantity = p_new_quantity, updated_at = NOW() 
    WHERE id = p_lot_id;

    RETURN json_build_object('success', true, 'lot_id', p_lot_id, 'new_quantity', p_new_quantity);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION rpc_adjust_lot_quantity FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_adjust_lot_quantity TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_adjust_lot_quantity TO service_role;


-- 3. RPC: REGISTER TRANSACTION
CREATE OR REPLACE FUNCTION rpc_register_transaction(
    p_booking_id uuid,
    p_payment_type text,
    p_payments jsonb
) RETURNS json 
SET search_path = public, pg_temp
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_cash_amt decimal(10,2) := 0;
    v_upi_amt decimal(10,2) := 0;
    v_total_payment decimal(10,2) := 0;
    v_mode text;
    v_payment jsonb;
    v_caller_uid uuid;
    v_amt decimal(10,2);
BEGIN
    -- Authorization Check
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL AND current_setting('role') != 'postgres' THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized: User must be authenticated');
    END IF;

    -- Transitional Note: This RPC mutates bookings instead of appending to a Ledger.
    -- A unified immutable transactions table will be implemented in Sprint 4.

    -- Pessimistic Lock on Booking
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Booking not found');
    END IF;

    -- Duplicate Payment Detection (Idempotency)
    IF p_payment_type = 'final' AND v_booking.payment_mode IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'Final payment already registered');
    END IF;
    IF p_payment_type = 'advance' AND v_booking.advance_payment_mode IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'Advance payment already registered');
    END IF;

    -- Calculate Totals and Validate Negative Amounts
    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
        v_amt := (v_payment->>'amount')::decimal;
        IF v_amt < 0 THEN
            RETURN json_build_object('success', false, 'error', 'Negative payments are not permitted');
        END IF;

        IF v_payment->>'mode' = 'Cash' THEN 
            v_cash_amt := v_cash_amt + v_amt;
        ELSIF v_payment->>'mode' = 'UPI' THEN 
            v_upi_amt := v_upi_amt + v_amt; 
        ELSE
            RETURN json_build_object('success', false, 'error', 'Invalid payment mode in JSON payload');
        END IF;
    END LOOP;

    v_total_payment := v_cash_amt + v_upi_amt;

    IF v_cash_amt > 0 AND v_upi_amt > 0 THEN v_mode := 'Split';
    ELSIF v_upi_amt > 0 THEN v_mode := 'UPI';
    ELSIF v_cash_amt > 0 THEN v_mode := 'Cash';
    ELSE v_mode := NULL; END IF;

    -- Overpayment Validation
    IF p_payment_type = 'final' THEN
        IF v_total_payment > (v_booking.total_amount - COALESCE(v_booking.advance_paid, 0)) THEN
            RETURN json_build_object('success', false, 'error', 'Payment exceeds outstanding balance');
        END IF;
    ELSIF p_payment_type = 'advance' THEN
        IF v_total_payment > v_booking.total_amount THEN
            RETURN json_build_object('success', false, 'error', 'Advance exceeds total booking amount');
        END IF;
    END IF;

    -- Update Booking State
    IF p_payment_type = 'advance' THEN
        UPDATE public.bookings SET 
            advance_paid = v_total_payment, 
            advance_payment_mode = v_mode, 
            advance_cash_amount = v_cash_amt, 
            advance_upi_amount = v_upi_amt, 
            updated_at = NOW() 
        WHERE id = p_booking_id;
    ELSIF p_payment_type = 'final' THEN
        UPDATE public.bookings SET 
            payment_mode = v_mode, 
            cash_amount = v_cash_amt, 
            upi_amount = v_upi_amt, 
            updated_at = NOW() 
        WHERE id = p_booking_id;
    ELSE
        RETURN json_build_object('success', false, 'error', 'Invalid payment type. Must be advance or final.');
    END IF;

    RETURN json_build_object('success', true, 'booking_id', p_booking_id, 'total_recorded', v_total_payment);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION rpc_register_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_register_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_register_transaction TO service_role;
-- SPRINT 1: PHASE 2 - VIEWS AND RPCS (ARCHITECTURE CORRECTED)

-- 1. CENTRALIZED INVENTORY VIEW
CREATE OR REPLACE VIEW public.vw_inventory_status AS
WITH AllocationSums AS (
    SELECT 
        a.lot_id, 
        SUM(a.quantity) as qty
    FROM public.allotments a
    JOIN public.bookings b ON a.booking_id = b.id
    WHERE b.status IN ('Pending', 'Allocated', 'Ready')
    GROUP BY a.lot_id
),
DeliveredBookingSums AS (
    -- SPRINT 3 MIGRATION NOTE: This CTE relies on booking status for deliveries.
    -- In Sprint 3, this must be rewritten to sum `quantity` from the future `delivery_line_items` table.
    SELECT 
        lot_id, 
        SUM(quantity) as qty
    FROM public.bookings
    WHERE status = 'Delivered' AND lot_id IS NOT NULL
    GROUP BY lot_id
),
DeliveredAllotmentSums AS (
    -- SPRINT 3 MIGRATION NOTE: This CTE relies on booking status for deliveries.
    -- In Sprint 3, this must be rewritten to sum `quantity` from the future `delivery_line_items` table.
    SELECT 
        a.lot_id, 
        SUM(a.quantity) as qty
    FROM public.allotments a
    JOIN public.bookings b ON a.booking_id = b.id
    WHERE b.status = 'Delivered' AND b.lot_id IS NULL
    GROUP BY a.lot_id
),
DirectSaleSums AS (
    SELECT 
        lot_id, 
        SUM(quantity) as qty
    FROM public.direct_sales
    GROUP BY lot_id
)
SELECT 
    l.id AS lot_id,
    l.initial_quantity AS produced_quantity,
    l.total_quantity AS survived_quantity,
    COALESCE(als.qty, 0) AS allocated_quantity,
    
    -- SPRINT 3 MIGRATION NOTE: Current sold calculation = Direct Sales + Delivered Bookings (via status check).
    -- Future sold calculation = Direct Sales + Sum of delivery_line_items.
    COALESCE(dbs.qty, 0) + COALESCE(das.qty, 0) + COALESCE(dss.qty, 0) AS sold_quantity,
    
    (l.total_quantity - (COALESCE(dbs.qty, 0) + COALESCE(das.qty, 0) + COALESCE(dss.qty, 0))) AS current_physical_stock,
    (l.total_quantity - COALESCE(als.qty, 0) - (COALESCE(dbs.qty, 0) + COALESCE(das.qty, 0) + COALESCE(dss.qty, 0))) AS free_stock,
    l.status
FROM public.lots l
LEFT JOIN AllocationSums als ON l.id = als.lot_id
LEFT JOIN DeliveredBookingSums dbs ON l.id = dbs.lot_id
LEFT JOIN DeliveredAllotmentSums das ON l.id = das.lot_id
LEFT JOIN DirectSaleSums dss ON l.id = dss.lot_id;


-- Drop the old Phase 2 function since we changed its signature
DROP FUNCTION IF EXISTS public.rpc_adjust_lot_quantity(uuid, integer, text, text, uuid);

-- 2. RPC: ADJUST LOT QUANTITY
CREATE OR REPLACE FUNCTION public.rpc_adjust_lot_quantity(
    p_lot_id uuid,
    p_new_quantity integer,
    p_reason text,
    p_remarks text,
    p_user_id uuid,
    p_expected_updated_at timestamp with time zone
) RETURNS json 
SET search_path = public, pg_temp
SECURITY DEFINER
AS $$
DECLARE
    v_lot record;
    v_inventory record;
    v_delta integer;
    v_caller_uid uuid;
BEGIN
    -- Authorization Check
    -- (Assuming auth.uid() returns the authenticated user if called via API)
    v_caller_uid := auth.uid();
    -- Allow bypass if called internally via postgres role (like in tests/mcp)
    IF v_caller_uid IS NULL AND current_user != 'postgres' THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized: User must be authenticated');
    END IF;

    -- Pessimistic Lock
    SELECT * INTO v_lot FROM public.lots WHERE id = p_lot_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Lot not found');
    END IF;

    -- Optimistic Concurrency Control (OCC)
    IF v_lot.updated_at != p_expected_updated_at THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'Concurrency Error: Lot was modified by another user. Please refresh and try again.', 
            'current_updated_at', v_lot.updated_at
        );
    END IF;

    -- Retrieve strictly calculated allocated/sold state from view
    SELECT * INTO v_inventory FROM public.vw_inventory_status WHERE lot_id = p_lot_id;

    -- Calculate Delta
    v_delta := p_new_quantity - v_lot.total_quantity;

    IF v_delta = 0 THEN
        RETURN json_build_object('success', false, 'error', 'No change in quantity');
    END IF;

    -- Validate via Inventory Mathematics v1.0 constraints
    IF p_new_quantity < (v_inventory.allocated_quantity + v_inventory.sold_quantity) THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'New quantity ' || p_new_quantity || ' is less than active allocations + sales (' || (v_inventory.allocated_quantity + v_inventory.sold_quantity) || ').'
        );
    END IF;

    -- Insert Audit Log
    INSERT INTO public.stock_adjustments (
        lot_id, quantity_change, previous_quantity, new_quantity, reason, remarks, performed_by
    ) VALUES (
        p_lot_id, v_delta, v_lot.total_quantity, p_new_quantity, p_reason, p_remarks, COALESCE(v_caller_uid, p_user_id)
    );

    -- Update Lot
    UPDATE public.lots 
    SET total_quantity = p_new_quantity, updated_at = NOW() 
    WHERE id = p_lot_id;

    RETURN json_build_object('success', true, 'lot_id', p_lot_id, 'new_quantity', p_new_quantity);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.rpc_adjust_lot_quantity(uuid, integer, text, text, uuid, timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_lot_quantity(uuid, integer, text, text, uuid, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_lot_quantity(uuid, integer, text, text, uuid, timestamp with time zone) TO service_role;


-- 3. RPC: REGISTER TRANSACTION
CREATE OR REPLACE FUNCTION public.rpc_register_transaction(
    p_booking_id uuid,
    p_payment_type text,
    p_payments jsonb
) RETURNS json 
SET search_path = public, pg_temp
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_cash_amt decimal(10,2) := 0;
    v_upi_amt decimal(10,2) := 0;
    v_total_payment decimal(10,2) := 0;
    v_mode text;
    v_payment jsonb;
    v_caller_uid uuid;
    v_amt decimal(10,2);
BEGIN
    -- Authorization Check
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL AND current_user != 'postgres' THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized: User must be authenticated');
    END IF;

    -- Transitional Note: This RPC mutates bookings instead of appending to a Ledger.
    -- A unified immutable transactions table will be implemented in Sprint 4.

    -- Pessimistic Lock on Booking
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Booking not found');
    END IF;

    -- Duplicate Payment Detection (Idempotency)
    IF p_payment_type = 'final' AND v_booking.payment_mode IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'Final payment already registered');
    END IF;
    IF p_payment_type = 'advance' AND v_booking.advance_payment_mode IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'Advance payment already registered');
    END IF;

    -- Calculate Totals and Validate Negative Amounts
    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
        v_amt := (v_payment->>'amount')::decimal;
        IF v_amt < 0 THEN
            RETURN json_build_object('success', false, 'error', 'Negative payments are not permitted');
        END IF;

        IF v_payment->>'mode' = 'Cash' THEN 
            v_cash_amt := v_cash_amt + v_amt;
        ELSIF v_payment->>'mode' = 'UPI' THEN 
            v_upi_amt := v_upi_amt + v_amt; 
        ELSE
            RETURN json_build_object('success', false, 'error', 'Invalid payment mode in JSON payload');
        END IF;
    END LOOP;

    v_total_payment := v_cash_amt + v_upi_amt;

    IF v_cash_amt > 0 AND v_upi_amt > 0 THEN v_mode := 'Split';
    ELSIF v_upi_amt > 0 THEN v_mode := 'UPI';
    ELSIF v_cash_amt > 0 THEN v_mode := 'Cash';
    ELSE v_mode := NULL; END IF;

    -- Overpayment Validation
    IF p_payment_type = 'final' THEN
        IF v_total_payment > (v_booking.total_amount - COALESCE(v_booking.advance_paid, 0)) THEN
            RETURN json_build_object('success', false, 'error', 'Payment exceeds outstanding balance');
        END IF;
    ELSIF p_payment_type = 'advance' THEN
        IF v_total_payment > v_booking.total_amount THEN
            RETURN json_build_object('success', false, 'error', 'Advance exceeds total booking amount');
        END IF;
    END IF;

    -- Update Booking State
    IF p_payment_type = 'advance' THEN
        UPDATE public.bookings SET 
            advance_paid = v_total_payment, 
            advance_payment_mode = v_mode, 
            advance_cash_amount = v_cash_amt, 
            advance_upi_amount = v_upi_amt, 
            updated_at = NOW() 
        WHERE id = p_booking_id;
    ELSIF p_payment_type = 'final' THEN
        UPDATE public.bookings SET 
            payment_mode = v_mode, 
            cash_amount = v_cash_amt, 
            upi_amount = v_upi_amt, 
            updated_at = NOW() 
        WHERE id = p_booking_id;
    ELSE
        RETURN json_build_object('success', false, 'error', 'Invalid payment type. Must be advance or final.');
    END IF;

    RETURN json_build_object('success', true, 'booking_id', p_booking_id, 'total_recorded', v_total_payment);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.rpc_register_transaction(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_register_transaction(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_register_transaction(uuid, text, jsonb) TO service_role;

-- ==========================================
-- SPRINT 3A: FINANCE BACKEND 
-- ==========================================

-- 1. Create ENUMs
CREATE TYPE public.booking_payment_type AS ENUM ('ADVANCE', 'FINAL');
CREATE TYPE public.expense_category AS ENUM ('Raw Materials', 'Labor', 'Logistics', 'Operations', 'Misc');
CREATE TYPE public.payment_mode_type AS ENUM ('Cash', 'UPI');

-- 2. Create booking_payments
CREATE TABLE public.booking_payments (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT NOT NULL,
    payment_type public.booking_payment_type NOT NULL,
    cash_amount decimal(10,2) NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
    upi_amount decimal(10,2) NOT NULL DEFAULT 0 CHECK (upi_amount >= 0),
    payment_date timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT check_positive_payment CHECK (cash_amount > 0 OR upi_amount > 0)
);

CREATE INDEX idx_booking_payments_booking_id ON public.booking_payments(booking_id);
CREATE INDEX idx_booking_payments_payment_date ON public.booking_payments(payment_date);

ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

-- 3. Create expenses
CREATE TABLE public.expenses (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    category public.expense_category NOT NULL,
    amount decimal(10,2) NOT NULL CHECK (amount > 0),
    payment_mode public.payment_mode_type NOT NULL,
    description text,
    expense_date timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_expenses_expense_date ON public.expenses(expense_date);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;


-- 5. Views

CREATE OR REPLACE VIEW public.vw_booking_status AS
SELECT 
    b.id AS booking_id,
    b.status AS booking_status,
    COALESCE(SUM(CASE WHEN bp.payment_type = 'ADVANCE' THEN bp.cash_amount + bp.upi_amount ELSE 0 END), 0) AS advance_paid,
    COALESCE(SUM(CASE WHEN bp.payment_type = 'FINAL' THEN bp.cash_amount + bp.upi_amount ELSE 0 END), 0) AS final_paid,
    COALESCE(SUM(bp.cash_amount + bp.upi_amount), 0) AS total_paid,
    (b.total_amount - COALESCE(SUM(bp.cash_amount + bp.upi_amount), 0)) AS outstanding_balance
FROM public.bookings b
LEFT JOIN public.booking_payments bp ON b.id = bp.booking_id
GROUP BY b.id, b.status, b.total_amount;


CREATE OR REPLACE VIEW public.vw_daily_cashbook AS
SELECT 
    payment_date AS datetime,
    'BOOKING_PAYMENT' AS transaction_type,
    cash_amount AS cash,
    upi_amount AS upi,
    (cash_amount + upi_amount) AS total,
    'Booking ' || payment_type AS description
FROM public.booking_payments
UNION ALL
SELECT 
    created_at AS datetime,
    'DIRECT_SALE' AS transaction_type,
    COALESCE(cash_amount, CASE WHEN payment_mode = 'Cash' THEN amount ELSE 0 END) AS cash,
    COALESCE(upi_amount, CASE WHEN payment_mode = 'UPI' THEN amount ELSE 0 END) AS upi,
    amount AS total,
    'Direct Sale ' || sale_number AS description
FROM public.direct_sales
UNION ALL
SELECT 
    expense_date AS datetime,
    'EXPENSE' AS transaction_type,
    CASE WHEN payment_mode = 'Cash' THEN -amount ELSE 0 END AS cash,
    CASE WHEN payment_mode = 'UPI' THEN -amount ELSE 0 END AS upi,
    -amount AS total,
    'Expense: ' || category || COALESCE(' - ' || description, '') AS description
FROM public.expenses;


CREATE OR REPLACE VIEW public.vw_profit_summary AS
SELECT 
    datetime::date AS date,
    SUM(CASE WHEN total > 0 THEN total ELSE 0 END) AS revenue,
    SUM(CASE WHEN total < 0 THEN ABS(total) ELSE 0 END) AS expenses,
    SUM(total) AS profit
FROM public.vw_daily_cashbook
GROUP BY datetime::date
ORDER BY datetime::date DESC;

-- 6. RPCs

CREATE OR REPLACE FUNCTION public.rpc_add_expense(
    p_category text,
    p_amount decimal,
    p_payment_mode text,
    p_description text
) RETURNS json 
SET search_path = public, pg_temp
SECURITY DEFINER
AS 
DECLARE
    v_caller_uid uuid;
    v_expense_id uuid;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL AND current_user != 'postgres' THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    IF p_amount <= 0 THEN
        RETURN json_build_object('success', false, 'error', 'Amount must be positive');
    END IF;

    INSERT INTO public.expenses (category, amount, payment_mode, description, created_by)
    VALUES (
        p_category::public.expense_category, 
        p_amount, 
        p_payment_mode::public.payment_mode_type, 
        p_description, 
        v_caller_uid
    ) RETURNING id INTO v_expense_id;

    -- Audit log
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
    VALUES (v_caller_uid, 'INSERT', 'expenses', v_expense_id::text, 'Expense added: ' || p_category || ' - ' || p_amount);

    RETURN json_build_object('success', true, 'expense_id', v_expense_id);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
 LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION public.rpc_collect_final_payment(
    p_booking_id uuid,
    p_cash_amount decimal,
    p_upi_amount decimal
) RETURNS json
SET search_path = public, pg_temp
SECURITY DEFINER
AS 
DECLARE
    v_caller_uid uuid;
    v_booking record;
    v_status record;
    v_total_payment decimal(10,2);
    v_payment_id uuid;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL AND current_user != 'postgres' THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    IF p_cash_amount < 0 OR p_upi_amount < 0 THEN
        RETURN json_build_object('success', false, 'error', 'Negative payments are not permitted');
    END IF;

    v_total_payment := p_cash_amount + p_upi_amount;

    IF v_total_payment <= 0 THEN
        RETURN json_build_object('success', false, 'error', 'Payment amount must be greater than zero');
    END IF;

    -- Lock Booking
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Booking not found');
    END IF;

    -- Get strict financial status
    SELECT * INTO v_status FROM public.vw_booking_status WHERE booking_id = p_booking_id;

    -- Check if already fully paid or delivered
    IF v_status.booking_status = 'Delivered' THEN
        RETURN json_build_object('success', false, 'error', 'Booking is already delivered');
    END IF;

    -- Validate exact payment
    IF v_total_payment != v_status.outstanding_balance THEN
        RETURN json_build_object('success', false, 'error', 'Payment amount ' || v_total_payment || ' does not match outstanding balance ' || v_status.outstanding_balance);
    END IF;

    -- Insert Immutable Row
    INSERT INTO public.booking_payments (booking_id, payment_type, cash_amount, upi_amount, created_by)
    VALUES (p_booking_id, 'FINAL', p_cash_amount, p_upi_amount, v_caller_uid)
    RETURNING id INTO v_payment_id;

    -- Transition Booking
    UPDATE public.bookings 
    SET status = 'Delivered', updated_at = NOW()
    WHERE id = p_booking_id;

    -- Audit log
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
    VALUES (v_caller_uid, 'UPDATE', 'bookings', p_booking_id::text, 'Final payment collected and booking delivered');

    RETURN json_build_object('success', true, 'payment_id', v_payment_id);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
 LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.rpc_add_expense(text, decimal, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_add_expense(text, decimal, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_add_expense(text, decimal, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_collect_final_payment(uuid, decimal, decimal) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_collect_final_payment(uuid, decimal, decimal) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_collect_final_payment(uuid, decimal, decimal) TO service_role;

-- UPDATE: process_bookings_batch (Sprint 3B)
-- 004_update_process_bookings.sql
-- Sprint 3B: Update process_bookings_batch to insert ADVANCE payment into booking_payments automatically.

CREATE OR REPLACE FUNCTION public.process_bookings_batch(p_bookings jsonb, p_customer jsonb, p_audit jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_customer_id UUID;
    v_booking JSONB;
BEGIN
    IF p_customer IS NOT NULL AND p_customer->>'mobile' IS NOT NULL AND p_customer->>'mobile' != '' THEN
        INSERT INTO customers (id, name, mobile, city, created_at) 
        VALUES (COALESCE((p_customer->>'id')::uuid, gen_random_uuid()), p_customer->>'name', p_customer->>'mobile', p_customer->>'city', now()) 
        ON CONFLICT (mobile) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city 
        RETURNING id INTO v_customer_id;
    END IF;

    FOR v_booking IN SELECT * FROM jsonb_array_elements(p_bookings) LOOP
        INSERT INTO bookings (id, booking_number, customer_name, customer_phone, city, plant_id, lot_id, quantity, advance_paid, advance_payment_mode, advance_cash_amount, advance_upi_amount, total_amount, booking_date, delivery_date, status, remarks, payment_mode, cash_amount, upi_amount, worker_id, assigned_to, created_at)
        VALUES ((v_booking->>'id')::uuid, v_booking->>'booking_number', v_booking->>'customer_name', v_booking->>'customer_phone', v_booking->>'city', (v_booking->>'plant_id')::uuid, NULLIF(v_booking->>'lot_id', '')::uuid, (v_booking->>'quantity')::int, (v_booking->>'advance_paid')::numeric, v_booking->>'advance_payment_mode', (v_booking->>'advance_cash_amount')::numeric, (v_booking->>'advance_upi_amount')::numeric, (v_booking->>'total_amount')::numeric, (v_booking->>'booking_date')::date, (v_booking->>'delivery_date')::date, v_booking->>'status', v_booking->>'remarks', v_booking->>'payment_mode', (v_booking->>'cash_amount')::numeric, (v_booking->>'upi_amount')::numeric, (v_booking->>'worker_id')::uuid, (v_booking->>'assigned_to')::uuid, now());

        -- Legacy Insert into transactions if advance is paid
        IF (v_booking->>'advance_paid')::numeric > 0 THEN
            INSERT INTO transactions (reference_type, reference_id, booking_number, customer_name, plant_names, amount, payment_mode, cash_amount, upi_amount, worker_id, created_at)
            VALUES (
                'BOOKING_ADVANCE', 
                (v_booking->>'id')::uuid, 
                v_booking->>'booking_number', 
                v_booking->>'customer_name', 
                (SELECT plant_name FROM plants WHERE id = (v_booking->>'plant_id')::uuid), 
                (v_booking->>'advance_paid')::numeric, 
                v_booking->>'advance_payment_mode', 
                (v_booking->>'advance_cash_amount')::numeric, 
                (v_booking->>'advance_upi_amount')::numeric, 
                (v_booking->>'worker_id')::uuid, 
                now()
            );
            
            -- NEW Sprint 3B immutable booking_payments event
            INSERT INTO booking_payments (
                booking_id,
                payment_type,
                cash_amount,
                upi_amount,
                payment_date,
                created_by
            ) VALUES (
                (v_booking->>'id')::uuid,
                'ADVANCE',
                (v_booking->>'advance_cash_amount')::numeric,
                (v_booking->>'advance_upi_amount')::numeric,
                now(),
                (v_booking->>'worker_id')::uuid
            );
        END IF;

        INSERT INTO audit_logs (id, user_id, user_name, action, table_name, record_id, details, created_at)
        VALUES (gen_random_uuid(), (p_audit->>'user_id')::uuid, p_audit->>'user_name', p_audit->>'action', 'bookings', v_booking->>'id', p_audit->'details', now());
    END LOOP;
END;
$function$;


-- 7. ATOMIC BOOKING CANCELLATION RPC (BKG-004)
CREATE OR REPLACE FUNCTION public.rpc_cancel_booking(
    p_booking_number text,
    p_user_id uuid DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking record;
    v_booking_count int;
    v_caller_uid uuid;
    v_caller_name text := 'Staff';
BEGIN
    -- Authorization & Identity Hardening:
    -- 1. If called via authenticated user JWT, always enforce auth.uid() to prevent user impersonation.
    -- 2. If called via service_role/internal context where auth.uid() is null, use verified p_user_id if valid.
    IF auth.uid() IS NOT NULL THEN
        v_caller_uid := auth.uid();
    ELSIF p_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
        v_caller_uid := p_user_id;
    ELSE
        -- Fallback to default owner UUID
        v_caller_uid := '00000000-0000-0000-0000-000000000000'::uuid;
    END IF;
    
    SELECT name INTO v_caller_name FROM public.users WHERE id = v_caller_uid;
    IF v_caller_name IS NULL THEN
        v_caller_name := 'Staff';
    END IF;

    -- 1. Check if booking exists and count rows
    SELECT COUNT(*) INTO v_booking_count 
    FROM public.bookings 
    WHERE booking_number = p_booking_number AND deleted_at IS NULL;

    IF v_booking_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Booking not found');
    END IF;

    -- 2. Verify booking is cancellable (cannot cancel already Delivered or Cancelled booking)
    IF EXISTS (
        SELECT 1 FROM public.bookings 
        WHERE booking_number = p_booking_number AND status = 'Delivered' AND deleted_at IS NULL
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Cannot cancel a booking that has already been delivered');
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.bookings 
        WHERE booking_number = p_booking_number AND status = 'Cancelled' AND deleted_at IS NULL
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Booking is already cancelled');
    END IF;

    -- 3. Release/deactivate all active allotments belonging to this booking
    UPDATE public.allotments a
    SET deleted_at = NOW()
    FROM public.bookings b
    WHERE a.booking_id = b.id
      AND b.booking_number = p_booking_number
      AND a.deleted_at IS NULL;

    -- 4. Mark booking rows as Cancelled (strictly retain advance, NO refund created per BKG-004)
    UPDATE public.bookings
    SET status = 'Cancelled',
        refund_amount = 0,
        refund_payment_mode = NULL,
        refund_status = 'Forfeited',
        updated_at = NOW()
    WHERE booking_number = p_booking_number AND deleted_at IS NULL;

    -- 5. Write audit log entry
    INSERT INTO public.audit_logs (
        id, user_id, user_name, action, table_name, record_id, details, created_at
    ) VALUES (
        uuid_generate_v4(),
        v_caller_uid,
        v_caller_name,
        'CANCEL_BOOKING',
        'bookings',
        p_booking_number,
        json_build_object(
            'note', 'Booking cancelled (advance retained by nursery per policy BKG-004)',
            'items_count', v_booking_count
        ),
        NOW()
    );

    RETURN json_build_object(
        'success', true, 
        'booking_number', p_booking_number, 
        'items_cancelled', v_booking_count
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Security: Restrict execution strictly to authenticated and service_role. Revoke anon.
REVOKE EXECUTE ON FUNCTION public.rpc_cancel_booking(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_booking(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_booking(text, uuid) TO service_role;



