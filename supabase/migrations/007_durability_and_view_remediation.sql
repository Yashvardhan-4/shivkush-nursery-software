-- Migration 007: Durability, View Remediation, Zero-Balance Delivery, and Caller Safety

-- 1. FIX INVENTORY VIEW (Filter out soft-deleted allotments, bookings, and direct sales)
CREATE OR REPLACE VIEW public.vw_inventory_status AS
WITH AllocationSums AS (
    SELECT 
        a.lot_id, 
        SUM(a.quantity) as qty
    FROM public.allotments a
    JOIN public.bookings b ON a.booking_id = b.id
    WHERE a.deleted_at IS NULL
      AND b.deleted_at IS NULL
      AND b.status IN ('Pending', 'Allocated', 'Ready')
    GROUP BY a.lot_id
),
DeliveredBookingSums AS (
    SELECT 
        lot_id, 
        SUM(quantity) as qty
    FROM public.bookings
    WHERE status = 'Delivered' 
      AND lot_id IS NOT NULL 
      AND deleted_at IS NULL
    GROUP BY lot_id
),
DeliveredAllotmentSums AS (
    SELECT 
        a.lot_id, 
        SUM(a.quantity) as qty
    FROM public.allotments a
    JOIN public.bookings b ON a.booking_id = b.id
    WHERE a.deleted_at IS NULL 
      AND b.deleted_at IS NULL
      AND b.status = 'Delivered' 
      AND b.lot_id IS NULL
    GROUP BY a.lot_id
),
DirectSaleSums AS (
    SELECT 
        lot_id, 
        SUM(quantity) as qty
    FROM public.direct_sales
    WHERE deleted_at IS NULL
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
LEFT JOIN DirectSaleSums dss ON l.id = dss.lot_id
WHERE l.deleted_at IS NULL;

-- 2. FIX BOOKING STATUS VIEW (Filter out soft-deleted bookings)
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
WHERE b.deleted_at IS NULL
GROUP BY b.id, b.status, b.total_amount;

-- 3. FIX rpc_collect_final_payment (Support Zero-Balance Delivery for 100% Prepaid Orders + Caller Fallback)
CREATE OR REPLACE FUNCTION public.rpc_collect_final_payment(
    p_booking_id uuid,
    p_cash_amount decimal,
    p_upi_amount decimal
) RETURNS json
SET search_path = public, pg_temp
SECURITY DEFINER
AS $$
DECLARE
    v_caller_uid uuid;
    v_status record;
    v_total_payment decimal;
    v_new_payment_id uuid;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL AND current_user != 'postgres' AND current_setting('role', true) != 'service_role' THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    IF p_cash_amount < 0 OR p_upi_amount < 0 THEN
        RETURN json_build_object('success', false, 'error', 'Payment amounts cannot be negative');
    END IF;

    v_total_payment := p_cash_amount + p_upi_amount;

    -- Lock the booking row
    PERFORM id FROM public.bookings WHERE id = p_booking_id FOR UPDATE;

    -- Fetch current authoritative balance from view
    SELECT * INTO v_status FROM public.vw_booking_status WHERE booking_id = p_booking_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Booking not found');
    END IF;

    IF v_status.booking_status = 'Delivered' THEN
        RETURN json_build_object('success', false, 'error', 'Booking already delivered');
    END IF;

    IF v_status.booking_status = 'Cancelled' THEN
        RETURN json_build_object('success', false, 'error', 'Cannot collect payment for a cancelled booking');
    END IF;

    -- CASE 1: 100% Prepaid Booking (Outstanding Balance = 0)
    IF v_status.outstanding_balance <= 0 THEN
        IF v_total_payment > 0 THEN
            RETURN json_build_object('success', false, 'error', 'Booking is already fully paid. No additional payment required.');
        END IF;

        -- Update booking status directly to Delivered without inserting into booking_payments
        UPDATE public.bookings SET 
            status = 'Delivered', 
            delivery_date = CURRENT_DATE,
            updated_at = timezone('utc'::text, now()) 
        WHERE id = p_booking_id;

        -- Audit log
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
        VALUES (
            COALESCE(v_caller_uid, '00000000-0000-0000-0000-000000000000'::uuid), 
            'DELIVER_PREPAID', 
            'bookings', 
            p_booking_id::text, 
            '100% prepaid order delivered. Outstanding balance was 0.'
        );

        RETURN json_build_object(
            'success', true, 
            'booking_id', p_booking_id, 
            'status', 'Delivered', 
            'outstanding_balance', 0,
            'payment_id', null
        );
    END IF;

    -- CASE 2: Outstanding Balance > 0 (Requires Positive Payment)
    IF v_total_payment <= 0 THEN
        RETURN json_build_object('success', false, 'error', 'Payment amount must be greater than zero');
    END IF;

    IF v_total_payment > v_status.outstanding_balance THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'Payment of ₹' || v_total_payment || ' exceeds outstanding balance of ₹' || v_status.outstanding_balance
        );
    END IF;

    -- Insert into immutable booking_payments
    INSERT INTO public.booking_payments (
        booking_id, 
        payment_type, 
        cash_amount, 
        upi_amount, 
        created_by
    ) VALUES (
        p_booking_id, 
        'FINAL', 
        p_cash_amount, 
        p_upi_amount, 
        v_caller_uid
    ) RETURNING id INTO v_new_payment_id;

    -- Update booking status to Delivered if fully paid
    IF (v_status.outstanding_balance - v_total_payment) = 0 THEN
        UPDATE public.bookings SET 
            status = 'Delivered', 
            delivery_date = CURRENT_DATE,
            updated_at = timezone('utc'::text, now()) 
        WHERE id = p_booking_id;
    END IF;

    -- Audit log
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
    VALUES (
        COALESCE(v_caller_uid, '00000000-0000-0000-0000-000000000000'::uuid), 
        'COLLECT_FINAL_PAYMENT', 
        'booking_payments', 
        v_new_payment_id::text, 
        'Collected final payment of ₹' || v_total_payment || ' for booking ' || p_booking_id::text
    );

    RETURN json_build_object(
        'success', true, 
        'booking_id', p_booking_id, 
        'payment_id', v_new_payment_id, 
        'amount_paid', v_total_payment,
        'remaining_balance', (v_status.outstanding_balance - v_total_payment)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.rpc_collect_final_payment(uuid, decimal, decimal) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_collect_final_payment(uuid, decimal, decimal) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_collect_final_payment(uuid, decimal, decimal) TO service_role;

-- 4. FIX rpc_add_expense (Caller Safety Fallback)
CREATE OR REPLACE FUNCTION public.rpc_add_expense(
    p_category text,
    p_amount decimal,
    p_payment_mode text,
    p_description text
) RETURNS json 
SET search_path = public, pg_temp
SECURITY DEFINER
AS $$
DECLARE
    v_caller_uid uuid;
    v_expense_id uuid;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL AND current_user != 'postgres' AND current_setting('role', true) != 'service_role' THEN
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

    -- Audit log with caller fallback
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
    VALUES (
        COALESCE(v_caller_uid, '00000000-0000-0000-0000-000000000000'::uuid), 
        'INSERT', 
        'expenses', 
        v_expense_id::text, 
        'Expense added: ' || p_category || ' - ' || p_amount
    );

    RETURN json_build_object('success', true, 'expense_id', v_expense_id);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.rpc_add_expense(text, decimal, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_add_expense(text, decimal, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_add_expense(text, decimal, text, text) TO service_role;
