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
