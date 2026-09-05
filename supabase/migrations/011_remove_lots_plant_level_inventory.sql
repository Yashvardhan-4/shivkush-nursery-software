-- Migration 011: Complete Removal of Lots & Allotments in Favor of Plant-Level Inventory
-- Date: 2026-09-05

-- 1. ADD total_stock TO plants
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'plants' AND column_name = 'total_stock'
    ) THEN
        ALTER TABLE public.plants ADD COLUMN total_stock integer NOT NULL DEFAULT 0 CHECK (total_stock >= 0);
    END IF;
END $$;

-- 2. MIGRATE EXISTING LOT QUANTITIES INTO plants.total_stock
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'lots'
    ) THEN
        UPDATE public.plants p
        SET total_stock = COALESCE((
            SELECT SUM(l.total_quantity) 
            FROM public.lots l 
            WHERE l.plant_id = p.id AND l.deleted_at IS NULL AND l.status != 'Completed'
        ), 0);
    END IF;
END $$;

-- 3. DROP VIEWS DEPENDING ON lots/allotments
DROP VIEW IF EXISTS public.vw_inventory_status CASCADE;

-- 4. UPDATE stock_adjustments TO REFERENCE plants INSTEAD OF lots
ALTER TABLE public.stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_lot_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'stock_adjustments' AND column_name = 'plant_id'
    ) THEN
        ALTER TABLE public.stock_adjustments ADD COLUMN plant_id uuid REFERENCES public.plants(id) ON DELETE CASCADE;
        
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'stock_adjustments' AND column_name = 'lot_id'
        ) AND EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'lots'
        ) THEN
            UPDATE public.stock_adjustments sa
            SET plant_id = l.plant_id
            FROM public.lots l
            WHERE sa.lot_id = l.id;
        END IF;
    END IF;
END $$;

-- If there are any stray rows with null plant_id, delete or assign fallback
DELETE FROM public.stock_adjustments WHERE plant_id IS NULL;
ALTER TABLE public.stock_adjustments ALTER COLUMN plant_id SET NOT NULL;
ALTER TABLE public.stock_adjustments DROP COLUMN IF EXISTS lot_id;

-- Update check constraint on stock_adjustments reason
ALTER TABLE public.stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_reason_check;
ALTER TABLE public.stock_adjustments ADD CONSTRAINT stock_adjustments_reason_check 
    CHECK (reason IN ('MORTALITY', 'RECOUNT_SHORTAGE', 'RECOUNT_SURPLUS', 'DAMAGE', 'OTHER', 'MANUAL_ADJUSTMENT'));

-- 5. UPDATE bookings TABLE
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_lot_id_fkey;
ALTER TABLE public.bookings DROP COLUMN IF EXISTS lot_id;

-- Update status check constraint to include 'Pending', 'Allocated', 'Ready', 'Delivered', 'Cancelled'
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check 
    CHECK (status IN ('Pending', 'Allocated', 'Ready', 'Delivered', 'Cancelled'));

-- 6. UPDATE direct_sales TABLE
ALTER TABLE public.direct_sales DROP CONSTRAINT IF EXISTS direct_sales_lot_id_fkey;
ALTER TABLE public.direct_sales DROP COLUMN IF EXISTS lot_id;

-- 7. DROP DEPRECATED LOT & ALLOTMENT TABLES
DROP TABLE IF EXISTS public.allotments CASCADE;
DROP TABLE IF EXISTS public.lots CASCADE;

-- 8. REBUILD AUTHORITATIVE VIEW: vw_inventory_status
CREATE OR REPLACE VIEW public.vw_inventory_status AS
SELECT 
    p.id AS plant_id,
    p.plant_name,
    p.variety,
    p.category,
    p.total_stock AS current_physical_stock,
    COALESCE(b.booked_qty, 0)::integer AS allocated_quantity,
    (p.total_stock - COALESCE(b.booked_qty, 0))::integer AS free_stock,
    p.selling_price,
    p.active
FROM public.plants p
LEFT JOIN (
    SELECT 
        plant_id, 
        SUM(quantity) AS booked_qty
    FROM public.bookings
    WHERE deleted_at IS NULL AND status IN ('Pending', 'Allocated', 'Ready')
    GROUP BY plant_id
) b ON p.id = b.plant_id
WHERE p.deleted_at IS NULL;

GRANT SELECT ON public.vw_inventory_status TO anon, authenticated, service_role;

-- 9. CREATE SECURE WORKER DIRECTORY VIEW (Fixes empty worker dropdowns / AttendanceManager)
CREATE OR REPLACE VIEW public.vw_active_workers AS
SELECT id, name, role, mobile FROM public.users;

GRANT SELECT ON public.vw_active_workers TO anon, authenticated, service_role;

-- 10. REBUILD RPC: process_direct_sales_batch (Atomic stock lock & decrement)
DROP FUNCTION IF EXISTS public.process_direct_sales_batch(jsonb, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.process_direct_sales_batch(
    p_sales jsonb,
    p_customer jsonb,
    p_audit jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_customer_id uuid;
    v_sale jsonb;
    v_plant_id uuid;
    v_qty int;
    v_curr_stock int;
BEGIN
    -- 1. Upsert customer if mobile is provided
    IF p_customer IS NOT NULL AND p_customer->>'mobile' IS NOT NULL AND trim(p_customer->>'mobile') != '' THEN
        INSERT INTO public.customers (id, name, mobile, city, created_at)
        VALUES (
            COALESCE(NULLIF(p_customer->>'id', '')::uuid, gen_random_uuid()),
            p_customer->>'name',
            trim(p_customer->>'mobile'),
            p_customer->>'city',
            now()
        )
        ON CONFLICT (mobile) DO UPDATE SET
            name = EXCLUDED.name,
            city = COALESCE(EXCLUDED.city, customers.city),
            updated_at = now()
        RETURNING id INTO v_customer_id;
    END IF;

    -- 2. Validate stock and decrement atomically for each sale item
    FOR v_sale IN SELECT * FROM jsonb_array_elements(p_sales) LOOP
        v_plant_id := (v_sale->>'plant_id')::uuid;
        v_qty := (v_sale->>'quantity')::int;

        -- Atomically lock the plant row
        SELECT total_stock INTO v_curr_stock 
        FROM public.plants 
        WHERE id = v_plant_id 
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Plant with ID % not found', v_plant_id;
        END IF;

        IF v_curr_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient physical stock for plant %. Requested: %, Available: %', 
                v_plant_id, v_qty, v_curr_stock;
        END IF;

        -- Deduct physical living stock
        UPDATE public.plants 
        SET total_stock = total_stock - v_qty,
            updated_at = now()
        WHERE id = v_plant_id;

        -- Insert direct sale record
        INSERT INTO public.direct_sales (
            id,
            sale_number,
            customer_name,
            customer_phone,
            plant_id,
            quantity,
            amount,
            payment_mode,
            cash_amount,
            upi_amount,
            worker_id,
            assigned_to,
            fulfillment_status,
            created_at
        ) VALUES (
            COALESCE(NULLIF(v_sale->>'id', '')::uuid, gen_random_uuid()),
            v_sale->>'sale_number',
            v_sale->>'customer_name',
            v_sale->>'customer_phone',
            v_plant_id,
            v_qty,
            (v_sale->>'amount')::numeric,
            v_sale->>'payment_mode',
            NULLIF(v_sale->>'cash_amount', '')::numeric,
            NULLIF(v_sale->>'upi_amount', '')::numeric,
            (v_sale->>'worker_id')::uuid,
            NULLIF(v_sale->>'assigned_to', '')::uuid,
            COALESCE(v_sale->>'fulfillment_status', 'Pending Handover'),
            COALESCE(NULLIF(v_sale->>'created_at', '')::timestamptz, now())
        );
    END LOOP;

    -- 3. Audit log
    IF p_audit IS NOT NULL THEN
        INSERT INTO public.audit_logs (
            id,
            user_id,
            user_name,
            action,
            table_name,
            record_id,
            details,
            created_at
        ) VALUES (
            gen_random_uuid(),
            COALESCE(NULLIF(p_audit->>'user_id', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
            COALESCE(p_audit->>'user_name', 'System'),
            COALESCE(p_audit->>'action', 'CREATE_SALE'),
            'direct_sales',
            COALESCE((p_sales->0->>'sale_number'), 'direct_sale'),
            COALESCE(p_audit->'details', '{}'::jsonb),
            now()
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_direct_sales_batch(jsonb, jsonb, jsonb) TO authenticated, anon, service_role;

-- 11. REBUILD RPC: process_bookings_batch
DROP FUNCTION IF EXISTS public.process_bookings_batch(jsonb, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.process_bookings_batch(
    p_bookings jsonb, 
    p_customer jsonb, 
    p_audit jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_customer_id uuid;
    v_booking jsonb;
    v_booking_id uuid;
    v_adv_cash numeric;
    v_adv_upi numeric;
    v_adv_paid numeric;
BEGIN
    -- 1. Upsert customer
    IF p_customer IS NOT NULL AND p_customer->>'mobile' IS NOT NULL AND trim(p_customer->>'mobile') != '' THEN
        INSERT INTO public.customers (id, name, mobile, city, created_at) 
        VALUES (
            COALESCE(NULLIF(p_customer->>'id', '')::uuid, gen_random_uuid()), 
            p_customer->>'name', 
            trim(p_customer->>'mobile'), 
            p_customer->>'city', 
            now()
        ) 
        ON CONFLICT (mobile) DO UPDATE SET 
            name = EXCLUDED.name, 
            city = COALESCE(EXCLUDED.city, customers.city),
            updated_at = now()
        RETURNING id INTO v_customer_id;
    END IF;

    -- 2. Insert bookings and advance payments
    FOR v_booking IN SELECT * FROM jsonb_array_elements(p_bookings) LOOP
        v_booking_id := (v_booking->>'id')::uuid;
        v_adv_paid := COALESCE((v_booking->>'advance_paid')::numeric, 0);
        v_adv_cash := COALESCE(NULLIF(v_booking->>'advance_cash_amount', '')::numeric, 0);
        v_adv_upi  := COALESCE(NULLIF(v_booking->>'advance_upi_amount', '')::numeric, 0);

        INSERT INTO public.bookings (
            id,
            booking_number,
            customer_name,
            customer_phone,
            city,
            plant_id,
            quantity,
            advance_paid,
            advance_payment_mode,
            advance_cash_amount,
            advance_upi_amount,
            total_amount,
            booking_date,
            delivery_date,
            status,
            remarks,
            payment_mode,
            cash_amount,
            upi_amount,
            worker_id,
            assigned_to,
            created_at
        ) VALUES (
            v_booking_id,
            v_booking->>'booking_number',
            v_booking->>'customer_name',
            v_booking->>'customer_phone',
            v_booking->>'city',
            (v_booking->>'plant_id')::uuid,
            (v_booking->>'quantity')::int,
            v_adv_paid,
            v_booking->>'advance_payment_mode',
            v_adv_cash,
            v_adv_upi,
            (v_booking->>'total_amount')::numeric,
            COALESCE(NULLIF(v_booking->>'booking_date', '')::date, CURRENT_DATE),
            NULLIF(v_booking->>'delivery_date', '')::date,
            COALESCE(v_booking->>'status', 'Pending'),
            v_booking->>'remarks',
            v_booking->>'payment_mode',
            NULLIF(v_booking->>'cash_amount', '')::numeric,
            NULLIF(v_booking->>'upi_amount', '')::numeric,
            (v_booking->>'worker_id')::uuid,
            NULLIF(v_booking->>'assigned_to', '')::uuid,
            now()
        );

        -- Insert immutable advance payment into booking_payments if advance > 0
        IF v_adv_paid > 0 THEN
            INSERT INTO public.booking_payments (
                id,
                booking_id,
                payment_type,
                cash_amount,
                upi_amount,
                payment_date,
                created_by
            ) VALUES (
                gen_random_uuid(),
                v_booking_id,
                'ADVANCE',
                v_adv_cash,
                v_adv_upi,
                now(),
                (v_booking->>'worker_id')::uuid
            );
        END IF;
    END LOOP;

    -- 3. Audit log
    IF p_audit IS NOT NULL THEN
        INSERT INTO public.audit_logs (
            id, 
            user_id, 
            user_name, 
            action, 
            table_name, 
            record_id, 
            details, 
            created_at
        ) VALUES (
            gen_random_uuid(), 
            COALESCE(NULLIF(p_audit->>'user_id', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid), 
            COALESCE(p_audit->>'user_name', 'Staff'), 
            COALESCE(p_audit->>'action', 'CREATE_BOOKINGS'), 
            'bookings', 
            COALESCE((p_bookings->0->>'booking_number'), 'booking'), 
            p_audit->'details', 
            now()
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_bookings_batch(jsonb, jsonb, jsonb) TO authenticated, anon, service_role;

-- 12. REBUILD RPC: rpc_collect_final_payment (Atomic inventory reduction & status handover)
DROP FUNCTION IF EXISTS public.rpc_collect_final_payment(uuid, decimal, decimal);
DROP FUNCTION IF EXISTS public.rpc_collect_final_payment(uuid, decimal, decimal, uuid);

CREATE OR REPLACE FUNCTION public.rpc_collect_final_payment(
    p_booking_id uuid,
    p_cash_amount decimal,
    p_upi_amount decimal,
    p_worker_id uuid DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_uid uuid;
    v_booking record;
    v_status record;
    v_total_payment decimal(10,2);
    v_payment_id uuid;
    v_curr_stock int;
BEGIN
    IF p_cash_amount < 0 OR p_upi_amount < 0 THEN
        RETURN json_build_object('success', false, 'error', 'Negative payments are not permitted');
    END IF;

    v_total_payment := p_cash_amount + p_upi_amount;

    -- Identify caller
    IF auth.uid() IS NOT NULL THEN
        v_caller_uid := auth.uid();
    ELSIF p_worker_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.users WHERE id = p_worker_id) THEN
        v_caller_uid := p_worker_id;
    ELSE
        v_caller_uid := '00000000-0000-0000-0000-000000000000'::uuid;
    END IF;

    -- Lock Booking
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Booking not found');
    END IF;

    -- Get strict financial status from authoritative view
    SELECT * INTO v_status FROM public.vw_booking_status WHERE booking_id = p_booking_id;

    IF v_status.booking_status = 'Delivered' THEN
        RETURN json_build_object('success', false, 'error', 'Booking is already delivered');
    END IF;

    IF v_status.booking_status = 'Cancelled' THEN
        RETURN json_build_object('success', false, 'error', 'Cannot deliver a cancelled booking');
    END IF;

    -- Validate exact payment
    IF v_total_payment != v_status.outstanding_balance THEN
        RETURN json_build_object('success', false, 'error', 
            'Payment amount ' || v_total_payment || ' does not match outstanding balance ' || v_status.outstanding_balance);
    END IF;

    -- Lock plant row and decrement physical living stock
    SELECT total_stock INTO v_curr_stock FROM public.plants WHERE id = v_booking.plant_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Plant variety not found');
    END IF;

    -- Deduct physical stock, clamping to 0 in case of minor discrepancy
    UPDATE public.plants 
    SET total_stock = GREATEST(0, total_stock - v_booking.quantity), 
        updated_at = NOW()
    WHERE id = v_booking.plant_id;

    -- Record final payment if any balance collected
    IF v_total_payment > 0 THEN
        INSERT INTO public.booking_payments (id, booking_id, payment_type, cash_amount, upi_amount, payment_date, created_by)
        VALUES (gen_random_uuid(), p_booking_id, 'FINAL', p_cash_amount, p_upi_amount, now(), v_caller_uid)
        RETURNING id INTO v_payment_id;
    END IF;

    -- Transition Booking to Delivered
    UPDATE public.bookings 
    SET status = 'Delivered', 
        delivery_date = COALESCE(delivery_date, CURRENT_DATE),
        updated_at = NOW()
    WHERE id = p_booking_id;

    -- Audit log
    INSERT INTO public.audit_logs (id, user_id, action, table_name, record_id, details, created_at)
    VALUES (
        gen_random_uuid(),
        v_caller_uid, 
        'UPDATE', 
        'bookings', 
        p_booking_id::text, 
        json_build_object('note', 'Final payment collected and booking delivered', 'quantity', v_booking.quantity),
        NOW()
    );

    RETURN json_build_object('success', true, 'payment_id', v_payment_id);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_collect_final_payment(uuid, decimal, decimal, uuid) TO anon, authenticated, service_role;

-- 13. REBUILD RPC: rpc_cancel_booking (Instant reservation release)
CREATE OR REPLACE FUNCTION public.rpc_cancel_booking(
    p_booking_number text,
    p_user_id uuid DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking_count int;
    v_caller_uid uuid;
    v_caller_name text := 'Staff';
BEGIN
    IF auth.uid() IS NOT NULL THEN
        v_caller_uid := auth.uid();
    ELSIF p_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
        v_caller_uid := p_user_id;
    ELSE
        v_caller_uid := '00000000-0000-0000-0000-000000000000'::uuid;
    END IF;
    
    SELECT name INTO v_caller_name FROM public.users WHERE id = v_caller_uid;
    IF v_caller_name IS NULL THEN
        v_caller_name := 'Staff';
    END IF;

    -- Check existence
    SELECT COUNT(*) INTO v_booking_count 
    FROM public.bookings 
    WHERE booking_number = p_booking_number AND deleted_at IS NULL;

    IF v_booking_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Booking not found');
    END IF;

    -- Verify booking is cancellable
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

    -- Mark booking rows as Cancelled (advance retained per BKG-004)
    -- Releasing the booking automatically restores free_stock in vw_inventory_status
    UPDATE public.bookings
    SET status = 'Cancelled',
        refund_amount = 0,
        refund_payment_mode = NULL,
        refund_status = 'Forfeited',
        updated_at = NOW()
    WHERE booking_number = p_booking_number AND deleted_at IS NULL;

    -- Audit log
    INSERT INTO public.audit_logs (
        id, user_id, user_name, action, table_name, record_id, details, created_at
    ) VALUES (
        gen_random_uuid(),
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

GRANT EXECUTE ON FUNCTION public.rpc_cancel_booking(text, uuid) TO anon, authenticated, service_role;

-- 14. NEW RPC: rpc_adjust_plant_stock (Audited plant mortality, damage, and recount)
DROP FUNCTION IF EXISTS public.rpc_adjust_lot_quantity(uuid, int, text, text, uuid);
DROP FUNCTION IF EXISTS public.rpc_adjust_plant_stock(uuid, int, text, text, uuid);

CREATE OR REPLACE FUNCTION public.rpc_adjust_plant_stock(
    p_plant_id uuid,
    p_new_stock int,
    p_reason text,
    p_remarks text DEFAULT NULL,
    p_user_id uuid DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_uid uuid;
    v_caller_name text := 'Owner';
    v_old_stock int;
    v_change int;
    v_adj_id uuid;
BEGIN
    IF p_new_stock < 0 THEN
        RETURN json_build_object('success', false, 'error', 'Stock quantity cannot be negative');
    END IF;

    IF p_reason NOT IN ('MORTALITY', 'RECOUNT_SHORTAGE', 'RECOUNT_SURPLUS', 'DAMAGE', 'OTHER', 'MANUAL_ADJUSTMENT') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid adjustment reason');
    END IF;

    IF auth.uid() IS NOT NULL THEN
        v_caller_uid := auth.uid();
    ELSIF p_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
        v_caller_uid := p_user_id;
    ELSE
        v_caller_uid := '00000000-0000-0000-0000-000000000000'::uuid;
    END IF;
    SELECT name INTO v_caller_name FROM public.users WHERE id = v_caller_uid;

    -- Lock plant
    SELECT total_stock INTO v_old_stock FROM public.plants WHERE id = p_plant_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Plant not found');
    END IF;

    v_change := p_new_stock - v_old_stock;
    IF v_change = 0 THEN
        RETURN json_build_object('success', true, 'message', 'No change in stock');
    END IF;

    -- Update plant total_stock
    UPDATE public.plants 
    SET total_stock = p_new_stock, updated_at = now() 
    WHERE id = p_plant_id;

    -- Record in stock_adjustments
    INSERT INTO public.stock_adjustments (
        id,
        plant_id,
        quantity_change,
        previous_quantity,
        new_quantity,
        reason,
        remarks,
        performed_by,
        created_at
    ) VALUES (
        gen_random_uuid(),
        p_plant_id,
        v_change,
        v_old_stock,
        p_new_stock,
        p_reason,
        p_remarks,
        v_caller_uid,
        now()
    ) RETURNING id INTO v_adj_id;

    -- Audit log
    INSERT INTO public.audit_logs (
        id, user_id, user_name, action, table_name, record_id, details, created_at
    ) VALUES (
        gen_random_uuid(),
        v_caller_uid,
        COALESCE(v_caller_name, 'Staff'),
        'ADJUST_PLANT_STOCK',
        'plants',
        p_plant_id::text,
        json_build_object(
            'adjustment_id', v_adj_id,
            'old_stock', v_old_stock,
            'new_stock', p_new_stock,
            'change', v_change,
            'reason', p_reason,
            'remarks', p_remarks
        ),
        now()
    );

    RETURN json_build_object(
        'success', true, 
        'plant_id', p_plant_id, 
        'old_stock', v_old_stock, 
        'new_stock', p_new_stock, 
        'quantity_change', v_change,
        'adjustment_id', v_adj_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_adjust_plant_stock(uuid, int, text, text, uuid) TO anon, authenticated, service_role;

-- 15. DROP OBSOLETE FUNCTIONS
DROP FUNCTION IF EXISTS public.allocate_lot(uuid, uuid, integer, uuid, text, integer, integer);
DROP FUNCTION IF EXISTS public.allocate_lot(uuid, uuid, integer, uuid, text);
DROP FUNCTION IF EXISTS public.release_booking_allotments(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.auto_complete_lots();

-- 16. AUDIT LOGS RLS FIX
DROP POLICY IF EXISTS "Allow public insert audit_logs" ON public.audit_logs;
CREATE POLICY "Allow public insert audit_logs" ON public.audit_logs FOR INSERT TO public WITH CHECK (true);

-- 17. PAYMENT QRS RLS FIX
DROP POLICY IF EXISTS "Allow public all payment_qrs" ON public.payment_qrs;
CREATE POLICY "Allow public select payment_qrs" ON public.payment_qrs FOR SELECT TO public USING (deleted_at IS NULL);
CREATE POLICY "Allow authenticated manage payment_qrs" ON public.payment_qrs FOR ALL TO authenticated USING (true) WITH CHECK (true);
