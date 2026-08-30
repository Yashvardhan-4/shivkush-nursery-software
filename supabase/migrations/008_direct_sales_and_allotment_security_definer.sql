-- Migration 008: Security Definer Hardening for Direct Sales and Allotments
-- Hardens process_direct_sales_batch, allocate_lot, and release_booking_allotments
-- with SECURITY DEFINER to ensure atomic execution without RLS policy violations.

-- 1. PROCESS DIRECT SALES BATCH
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

    -- 2. Insert direct sales items
    FOR v_sale IN SELECT * FROM jsonb_array_elements(p_sales) LOOP
        INSERT INTO public.direct_sales (
            id,
            sale_number,
            customer_name,
            customer_phone,
            plant_id,
            lot_id,
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
            (v_sale->>'plant_id')::uuid,
            NULLIF(v_sale->>'lot_id', '')::uuid,
            (v_sale->>'quantity')::int,
            (v_sale->>'amount')::numeric,
            v_sale->>'payment_mode',
            NULLIF(v_sale->>'cash_amount', '')::numeric,
            NULLIF(v_sale->>'upi_amount', '')::numeric,
            (v_sale->>'worker_id')::uuid,
            NULLIF(v_sale->>'assigned_to', '')::uuid,
            v_sale->>'fulfillment_status',
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

GRANT EXECUTE ON FUNCTION public.process_direct_sales_batch(jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_direct_sales_batch(jsonb, jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.process_direct_sales_batch(jsonb, jsonb, jsonb) TO service_role;


-- 2. ALLOCATE LOT
CREATE OR REPLACE FUNCTION public.allocate_lot(
    p_booking_id uuid,
    p_lot_id uuid,
    p_quantity integer,
    p_user_id uuid,
    p_user_name text,
    p_booking_quantity integer,
    p_total_allotted integer
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_new_allotment_id uuid := gen_random_uuid();
    v_is_fully_allotted boolean;
BEGIN
    IF p_quantity <= 0 THEN
        RETURN json_build_object('success', false, 'error', 'Quantity must be greater than zero');
    END IF;

    -- Insert allotment record
    INSERT INTO public.allotments (
        id,
        booking_id,
        lot_id,
        quantity,
        allotted_by,
        created_at
    ) VALUES (
        v_new_allotment_id,
        p_booking_id,
        p_lot_id,
        p_quantity,
        COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
        now()
    );

    -- Update booking status if fully allotted
    v_is_fully_allotted := (p_total_allotted + p_quantity) >= p_booking_quantity;
    IF v_is_fully_allotted THEN
        UPDATE public.bookings 
        SET status = 'Allocated',
            lot_id = p_lot_id,
            updated_at = now()
        WHERE id = p_booking_id;
    END IF;

    -- Audit log
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
        COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(p_user_name, 'Owner'),
        'ALLOT_BOOKING',
        'allotments',
        v_new_allotment_id::text,
        json_build_object('booking_id', p_booking_id, 'lot_id', p_lot_id, 'quantity', p_quantity),
        now()
    );

    RETURN json_build_object('success', true, 'allotment_id', v_new_allotment_id);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_lot(uuid, uuid, integer, uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_lot(uuid, uuid, integer, uuid, text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.allocate_lot(uuid, uuid, integer, uuid, text, integer, integer) TO service_role;


-- 3. RELEASE BOOKING ALLOTMENTS
CREATE OR REPLACE FUNCTION public.release_booking_allotments(
    p_booking_id uuid,
    p_user_id uuid,
    p_user_name text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cleared_count integer;
BEGIN
    -- Soft-delete all active allotments for this booking
    UPDATE public.allotments
    SET deleted_at = now()
    WHERE booking_id = p_booking_id AND deleted_at IS NULL;
    
    GET DIAGNOSTICS v_cleared_count = ROW_COUNT;

    -- Reset booking status to Pending and clear lot_id
    UPDATE public.bookings
    SET status = 'Pending',
        lot_id = null,
        updated_at = now()
    WHERE id = p_booking_id;

    -- Audit log
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
        COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(p_user_name, 'Owner'),
        'RELEASE_ALLOTMENT',
        'allotments',
        p_booking_id::text,
        json_build_object('booking_id', p_booking_id, 'cleared_count', v_cleared_count),
        now()
    );

    RETURN json_build_object('success', true, 'cleared_count', v_cleared_count);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_booking_allotments(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_booking_allotments(uuid, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.release_booking_allotments(uuid, uuid, text) TO service_role;
