-- SPRINT 1: PHASE 2 - VIEWS AND RPCS

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
