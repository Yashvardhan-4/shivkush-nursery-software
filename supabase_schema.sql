-- ENABLE UUID EXTENSION
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- DROP EXISTING TABLES AND FUNCTIONS (CLEARS ALL SCHEMA AND DATA)
DROP FUNCTION IF EXISTS process_sync_batch(json);
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.attendance CASCADE;
DROP TABLE IF EXISTS public.direct_sales CASCADE;
DROP TABLE IF EXISTS public.allotments CASCADE;
DROP TABLE IF EXISTS public.bookings CASCADE;
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
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- PLANTS TABLE
CREATE TABLE public.plants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plant_name text NOT NULL,
  variety text NOT NULL,
  selling_price decimal(10,2) NOT NULL,
  description text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- LOTS TABLE
CREATE TABLE public.lots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lot_number text UNIQUE NOT NULL,
  plant_id uuid REFERENCES public.plants(id) NOT NULL,
  total_quantity integer NOT NULL,
  ready_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('Growing', 'Ready', 'Completed')),
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- BOOKINGS TABLE
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_number text NOT NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  city text,
  plant_id uuid REFERENCES public.plants(id) NOT NULL,
  lot_id uuid REFERENCES public.lots(id),
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
  worker_id uuid REFERENCES public.users(id),
  assigned_to uuid REFERENCES public.users(id),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ALLOTMENTS TABLE
CREATE TABLE public.allotments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id uuid REFERENCES public.bookings(id) NOT NULL,
  lot_id uuid REFERENCES public.lots(id) NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  allotted_by uuid REFERENCES public.users(id) NOT NULL,
  allotted_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- DIRECT SALES TABLE
CREATE TABLE public.direct_sales (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_number text NOT NULL,
  customer_name text,
  customer_phone text,
  plant_id uuid REFERENCES public.plants(id) NOT NULL,
  lot_id uuid REFERENCES public.lots(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  amount decimal(10,2) NOT NULL CHECK (amount > 0),
  payment_mode text NOT NULL CHECK (payment_mode IN ('Cash', 'UPI', 'Split')),
  cash_amount decimal(10,2),
  upi_amount decimal(10,2),
  worker_id uuid REFERENCES public.users(id) NOT NULL,
  assigned_to uuid REFERENCES public.users(id),
  fulfillment_status text CHECK (fulfillment_status IN ('Pending Handover', 'Fulfilled')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ATTENDANCE TABLE
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id uuid REFERENCES public.users(id) NOT NULL,
  date date DEFAULT CURRENT_DATE NOT NULL,
  status text NOT NULL CHECK (status IN ('Present', 'Absent', 'Half Day')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- AUDIT LOGS TABLE
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.users(id) NOT NULL,
  user_name text,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  details text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- CUSTOMERS TABLE
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  mobile text UNIQUE NOT NULL,
  city text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- PAYMENT QRS TABLE
CREATE TABLE public.payment_qrs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  upi_id text NOT NULL,
  image_data text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ROW LEVEL SECURITY (RLS) SETTINGS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allotments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_qrs ENABLE ROW LEVEL SECURITY;

-- Allow broad access policy (handles RLS at Application Layer)
CREATE POLICY "Allow broad access during dev" ON public.plants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow broad access during dev" ON public.lots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow broad access during dev" ON public.bookings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow broad access during dev" ON public.allotments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow broad access during dev" ON public.direct_sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow broad access during dev" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow broad access during dev" ON public.attendance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow broad access during dev" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow broad access during dev" ON public.customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow broad access during dev" ON public.payment_qrs FOR ALL USING (true) WITH CHECK (true);

-- PROCESS SYNC BATCH RPC FUNCTION (Supports all tables and properties)
CREATE OR REPLACE FUNCTION process_sync_batch(payload JSON)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
        item_id := (p->>'id')::uuid;

        IF tbl = 'plants' THEN
            IF act = 'INSERT' THEN
                INSERT INTO public.plants (id, plant_name, variety, selling_price, description, active, created_at)
                VALUES (
                    (p->>'id')::uuid,
                    p->>'plant_name',
                    p->>'variety',
                    (p->>'selling_price')::decimal,
                    p->>'description',
                    COALESCE((p->>'active')::boolean, true),
                    COALESCE(NULLIF(p->>'created_at','')::timestamp with time zone, now())
                ) ON CONFLICT (id) DO UPDATE SET
                    plant_name = EXCLUDED.plant_name,
                    variety = EXCLUDED.variety,
                    selling_price = EXCLUDED.selling_price,
                    description = EXCLUDED.description,
                    active = EXCLUDED.active;
            ELSIF act = 'UPDATE' THEN
                UPDATE public.plants SET
                    plant_name = COALESCE(p->>'plant_name', plant_name),
                    variety = COALESCE(p->>'variety', variety),
                    selling_price = COALESCE((p->>'selling_price')::decimal, selling_price),
                    description = COALESCE(p->>'description', description),
                    active = COALESCE((p->>'active')::boolean, active)
                WHERE id = item_id;
            ELSIF act = 'DELETE' THEN
                DELETE FROM public.plants WHERE id = item_id;
            END IF;

        ELSIF tbl = 'customers' THEN
            IF act = 'INSERT' THEN
                INSERT INTO public.customers (id, name, mobile, city, created_at)
                VALUES (
                    (p->>'id')::uuid,
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
                    city = COALESCE(p->>'city', city)
                WHERE id = item_id;
            ELSIF act = 'DELETE' THEN
                DELETE FROM public.customers WHERE id = item_id;
            END IF;

        ELSIF tbl = 'lots' THEN
            IF act = 'INSERT' THEN
                INSERT INTO public.lots (id, lot_number, plant_id, total_quantity, ready_date, status, notes, created_at)
                VALUES (
                    (p->>'id')::uuid,
                    p->>'lot_number',
                    (p->>'plant_id')::uuid,
                    (p->>'total_quantity')::integer,
                    (p->>'ready_date')::date,
                    p->>'status',
                    p->>'notes',
                    COALESCE(NULLIF(p->>'created_at','')::timestamp with time zone, now())
                ) ON CONFLICT (id) DO UPDATE SET
                    lot_number = EXCLUDED.lot_number,
                    plant_id = EXCLUDED.plant_id,
                    total_quantity = EXCLUDED.total_quantity,
                    ready_date = EXCLUDED.ready_date,
                    status = EXCLUDED.status,
                    notes = EXCLUDED.notes;
            ELSIF act = 'UPDATE' THEN
                UPDATE public.lots SET
                    lot_number = COALESCE(p->>'lot_number', lot_number),
                    plant_id = COALESCE((p->>'plant_id')::uuid, plant_id),
                    total_quantity = COALESCE((p->>'total_quantity')::integer, total_quantity),
                    ready_date = COALESCE((p->>'ready_date')::date, ready_date),
                    status = COALESCE(p->>'status', status),
                    notes = COALESCE(p->>'notes', notes)
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
                    payment_mode, cash_amount, upi_amount, worker_id, assigned_to, created_at
                ) VALUES (
                    (p->>'id')::uuid,
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
                    (p->>'booking_date')::date,
                    NULLIF(p->>'delivery_date', '')::date,
                    p->>'status',
                    p->>'remarks',
                    p->>'payment_mode',
                    NULLIF(p->>'cash_amount', '')::decimal,
                    NULLIF(p->>'upi_amount', '')::decimal,
                    NULLIF(p->>'worker_id', '')::uuid,
                    NULLIF(p->>'assigned_to', '')::uuid,
                    COALESCE(NULLIF(p->>'created_at','')::timestamp with time zone, now())
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
                    assigned_to = EXCLUDED.assigned_to;
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
                    assigned_to = COALESCE(NULLIF(p->>'assigned_to', '')::uuid, assigned_to)
                WHERE id = item_id;
            ELSIF act = 'DELETE' THEN
                DELETE FROM public.bookings WHERE id = item_id;
            END IF;

        ELSIF tbl = 'allotments' THEN
            IF act = 'INSERT' THEN
                INSERT INTO public.allotments (id, booking_id, lot_id, quantity, allotted_by, allotted_at)
                VALUES (
                    (p->>'id')::uuid,
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
                    allotted_at = COALESCE(NULLIF(p->>'allotted_at', '')::timestamp with time zone, allotted_at)
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
                    (p->>'id')::uuid,
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
                    fulfillment_status = COALESCE(p->>'fulfillment_status', fulfillment_status)
                WHERE id = item_id;
            ELSIF act = 'DELETE' THEN
                DELETE FROM public.direct_sales WHERE id = item_id;
            END IF;

        ELSIF tbl = 'attendance' THEN
            IF act = 'INSERT' THEN
                INSERT INTO public.attendance (id, worker_id, date, status, created_at)
                VALUES (
                    (p->>'id')::uuid,
                    (p->>'worker_id')::uuid,
                    (p->>'date')::date,
                    p->>'status',
                    COALESCE(NULLIF(p->>'created_at','')::timestamp with time zone, now())
                ) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;
            ELSIF act = 'UPDATE' THEN
                UPDATE public.attendance SET
                    worker_id = COALESCE(NULLIF(p->>'worker_id', '')::uuid, worker_id),
                    date = COALESCE(NULLIF(p->>'date', '')::date, date),
                    status = COALESCE(p->>'status', status)
                WHERE id = item_id;
            ELSIF act = 'DELETE' THEN
                DELETE FROM public.attendance WHERE id = item_id;
            END IF;

        ELSIF tbl = 'payment_qrs' THEN
            IF act = 'INSERT' THEN
                INSERT INTO public.payment_qrs (id, name, upi_id, image_data, active, created_at)
                VALUES (
                    (p->>'id')::uuid,
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
                    active = COALESCE((p->>'active')::boolean, active)
                WHERE id = item_id;
            ELSIF act = 'DELETE' THEN
                DELETE FROM public.payment_qrs WHERE id = item_id;
            END IF;

        ELSIF tbl = 'audit_logs' THEN
            IF act = 'INSERT' THEN
                INSERT INTO public.audit_logs (id, user_id, user_name, action, table_name, record_id, details, created_at)
                VALUES (
                    (p->>'id')::uuid,
                    (p->>'user_id')::uuid,
                    p->>'user_name',
                    p->>'action',
                    p->>'table_name',
                    p->>'record_id',
                    p->>'details',
                    COALESCE(NULLIF(p->>'created_at','')::timestamp with time zone, now())
                ) ON CONFLICT (id) DO NOTHING;
            END IF;
        END IF;
    END LOOP;
END;
$$;

-- SEED AN INITIAL OWNER ACCOUNT
-- Mobile: 9999999999, Password: admin
-- You can log in with these credentials, go to Staff Management to create workers, and delete/modify this account as needed.
INSERT INTO public.users (id, name, mobile, role, password_hash)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Owner',
  '9999999999',
  'owner',
  '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918' -- SHA-256 hash of 'admin'
) ON CONFLICT (mobile) DO NOTHING;
