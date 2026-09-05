-- ==============================================================================
-- MIGRATION 012: Direct Sales Queue & Open Bookings
-- 1. Remove inventory checking & stock decrement from process_direct_sales_batch (direct sales are for sales accounting only, no stock gating)
-- 2. Add atomic RPC rpc_fulfill_direct_sale (handover to customer)
-- 3. Add atomic RPC rpc_cancel_direct_sale (soft-delete direct sale if cancelled)
-- ==============================================================================

-- 1. REBUILD RPC: process_direct_sales_batch
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
BEGIN
    -- 1. Upsert customer if details provided
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

    -- 2. Insert direct sale records (NO stock gating or physical decrement)
    FOR v_sale IN SELECT * FROM jsonb_array_elements(p_sales) LOOP
        v_plant_id := (v_sale->>'plant_id')::uuid;
        v_qty := (v_sale->>'quantity')::int;

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
            COALESCE(p_audit->>'user_name', 'Staff'),
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

-- 2. NEW RPC: rpc_fulfill_direct_sale (Order handover)
CREATE OR REPLACE FUNCTION public.rpc_fulfill_direct_sale(
    p_sale_number text,
    p_fulfilled_by uuid DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_updated_count int;
    v_caller_uid uuid;
    v_caller_name text := 'Staff';
BEGIN
    IF auth.uid() IS NOT NULL THEN
        v_caller_uid := auth.uid();
    ELSIF p_fulfilled_by IS NOT NULL AND EXISTS (SELECT 1 FROM public.users WHERE id = p_fulfilled_by) THEN
        v_caller_uid := p_fulfilled_by;
    ELSE
        v_caller_uid := '00000000-0000-0000-0000-000000000000'::uuid;
    END IF;

    SELECT name INTO v_caller_name FROM public.users WHERE id = v_caller_uid;
    IF v_caller_name IS NULL THEN
        v_caller_name := 'Staff';
    END IF;

    UPDATE public.direct_sales
    SET fulfillment_status = 'Fulfilled',
        updated_at = now()
    WHERE sale_number = p_sale_number
      AND deleted_at IS NULL;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Sale not found or already deleted');
    END IF;

    INSERT INTO public.audit_logs (
        id, user_id, user_name, action, table_name, record_id, details, created_at
    ) VALUES (
        gen_random_uuid(),
        v_caller_uid,
        v_caller_name,
        'FULFILL_SALE',
        'direct_sales',
        p_sale_number,
        json_build_object('note', 'Order given to customer', 'items_count', v_updated_count),
        now()
    );

    RETURN json_build_object('success', true, 'items_fulfilled', v_updated_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_fulfill_direct_sale(text, uuid) TO anon, authenticated, service_role;

-- 3. NEW RPC: rpc_cancel_direct_sale (Cancel before handover)
CREATE OR REPLACE FUNCTION public.rpc_cancel_direct_sale(
    p_sale_number text,
    p_cancelled_by uuid DEFAULT NULL,
    p_reason text DEFAULT 'Customer cancelled'
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_updated_count int;
    v_caller_uid uuid;
    v_caller_name text := 'Staff';
BEGIN
    IF auth.uid() IS NOT NULL THEN
        v_caller_uid := auth.uid();
    ELSIF p_cancelled_by IS NOT NULL AND EXISTS (SELECT 1 FROM public.users WHERE id = p_cancelled_by) THEN
        v_caller_uid := p_cancelled_by;
    ELSE
        v_caller_uid := '00000000-0000-0000-0000-000000000000'::uuid;
    END IF;

    SELECT name INTO v_caller_name FROM public.users WHERE id = v_caller_uid;
    IF v_caller_name IS NULL THEN
        v_caller_name := 'Staff';
    END IF;

    UPDATE public.direct_sales
    SET deleted_at = now(),
        updated_at = now()
    WHERE sale_number = p_sale_number
      AND deleted_at IS NULL;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Sale not found or already cancelled');
    END IF;

    INSERT INTO public.audit_logs (
        id, user_id, user_name, action, table_name, record_id, details, created_at
    ) VALUES (
        gen_random_uuid(),
        v_caller_uid,
        v_caller_name,
        'CANCEL_SALE',
        'direct_sales',
        p_sale_number,
        json_build_object('note', p_reason, 'items_cancelled', v_updated_count),
        now()
    );

    RETURN json_build_object('success', true, 'items_cancelled', v_updated_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_cancel_direct_sale(text, uuid, text) TO anon, authenticated, service_role;
