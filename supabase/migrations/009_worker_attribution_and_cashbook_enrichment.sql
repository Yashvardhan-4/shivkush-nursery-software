-- Migration 009: Track Worker Sales & Enrich Daily Cashbook with Worker Info
-- 1. Update rpc_collect_final_payment to accept worker ID and set created_by
-- 2. Update vw_daily_cashbook to include worker_id and worker_name across all transaction sources

-- 1. Enhanced rpc_collect_final_payment with worker attribution
DROP FUNCTION IF EXISTS public.rpc_collect_final_payment(uuid, numeric, numeric);
DROP FUNCTION IF EXISTS public.rpc_collect_final_payment(uuid, decimal, decimal);
DROP FUNCTION IF EXISTS public.rpc_collect_final_payment(uuid, numeric, numeric, uuid);
DROP FUNCTION IF EXISTS public.rpc_collect_final_payment(uuid, decimal, decimal, uuid);

CREATE OR REPLACE FUNCTION public.rpc_collect_final_payment(
    p_booking_id uuid,
    p_cash_amount decimal,
    p_upi_amount decimal,
    p_worker_id uuid DEFAULT NULL
) RETURNS json
SET search_path = public, pg_temp
SECURITY DEFINER
AS $$
DECLARE
    v_caller_uid uuid;
    v_effective_worker uuid;
    v_status record;
    v_total_payment decimal;
    v_new_payment_id uuid;
BEGIN
    v_caller_uid := auth.uid();
    v_effective_worker := COALESCE(p_worker_id, v_caller_uid);

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
            COALESCE(v_effective_worker, '00000000-0000-0000-0000-000000000000'::uuid), 
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

    -- Insert into immutable booking_payments with worker attribution
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
        v_effective_worker
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
        COALESCE(v_effective_worker, '00000000-0000-0000-0000-000000000000'::uuid), 
        'COLLECT_PAYMENT_AND_DELIVER', 
        'booking_payments', 
        v_new_payment_id::text, 
        'Collected ₹' || v_total_payment || ' (Cash: ₹' || p_cash_amount || ', UPI: ₹' || p_upi_amount || '). New balance: ₹' || (v_status.outstanding_balance - v_total_payment)
    );

    RETURN json_build_object(
        'success', true, 
        'booking_id', p_booking_id, 
        'status', (CASE WHEN (v_status.outstanding_balance - v_total_payment) = 0 THEN 'Delivered' ELSE v_status.booking_status END), 
        'outstanding_balance', (v_status.outstanding_balance - v_total_payment),
        'payment_id', v_new_payment_id
    );
END;
$$ LANGUAGE plpgsql;

-- 2. Enrich vw_daily_cashbook with worker_id and worker_name
CREATE OR REPLACE VIEW public.vw_daily_cashbook AS
SELECT 
    bp.payment_date AS datetime,
    'BOOKING_PAYMENT' AS transaction_type,
    bp.cash_amount AS cash,
    bp.upi_amount AS upi,
    (bp.cash_amount + bp.upi_amount) AS total,
    'Booking ' || bp.payment_type AS description,
    bp.created_by AS worker_id,
    u.name AS worker_name
FROM public.booking_payments bp
LEFT JOIN public.users u ON bp.created_by = u.id
UNION ALL
SELECT 
    ds.created_at AS datetime,
    'DIRECT_SALE' AS transaction_type,
    COALESCE(ds.cash_amount, CASE WHEN ds.payment_mode = 'Cash' THEN ds.amount ELSE 0 END) AS cash,
    COALESCE(ds.upi_amount, CASE WHEN ds.payment_mode = 'UPI' THEN ds.amount ELSE 0 END) AS upi,
    ds.amount AS total,
    'Direct Sale ' || ds.sale_number AS description,
    ds.worker_id AS worker_id,
    u.name AS worker_name
FROM public.direct_sales ds
LEFT JOIN public.users u ON ds.worker_id = u.id
WHERE ds.deleted_at IS NULL
UNION ALL
SELECT 
    e.expense_date AS datetime,
    'EXPENSE' AS transaction_type,
    CASE WHEN e.payment_mode = 'Cash' THEN -e.amount ELSE 0 END AS cash,
    CASE WHEN e.payment_mode = 'UPI' THEN -e.amount ELSE 0 END AS upi,
    -e.amount AS total,
    'Expense: ' || e.category || COALESCE(' - ' || e.description, '') AS description,
    e.created_by AS worker_id,
    u.name AS worker_name
FROM public.expenses e
LEFT JOIN public.users u ON e.created_by = u.id;
