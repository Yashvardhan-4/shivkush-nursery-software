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

-- 4. Historical Migration

INSERT INTO public.booking_payments (booking_id, payment_type, cash_amount, upi_amount, payment_date, created_by)
SELECT 
    id,
    'ADVANCE'::public.booking_payment_type,
    COALESCE(advance_cash_amount, CASE WHEN advance_payment_mode = 'Cash' THEN advance_paid ELSE 0 END),
    COALESCE(advance_upi_amount, CASE WHEN advance_payment_mode = 'UPI' THEN advance_paid ELSE 0 END),
    booking_date::timestamp with time zone,
    worker_id
FROM public.bookings
WHERE COALESCE(advance_paid, 0) > 0 OR COALESCE(advance_cash_amount, 0) > 0 OR COALESCE(advance_upi_amount, 0) > 0;

INSERT INTO public.booking_payments (booking_id, payment_type, cash_amount, upi_amount, payment_date, created_by)
SELECT 
    id,
    'FINAL'::public.booking_payment_type,
    COALESCE(cash_amount, CASE WHEN payment_mode = 'Cash' THEN (total_amount - COALESCE(advance_paid, 0)) ELSE 0 END),
    COALESCE(upi_amount, CASE WHEN payment_mode = 'UPI' THEN (total_amount - COALESCE(advance_paid, 0)) ELSE 0 END),
    COALESCE(delivery_date::timestamp with time zone, updated_at),
    worker_id
FROM public.bookings
WHERE payment_mode IS NOT NULL AND (COALESCE(cash_amount, 0) > 0 OR COALESCE(upi_amount, 0) > 0 OR (total_amount - COALESCE(advance_paid, 0)) > 0);


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
AS $$
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
$$ LANGUAGE plpgsql;


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
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.rpc_add_expense(text, decimal, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_add_expense(text, decimal, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_add_expense(text, decimal, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_collect_final_payment(uuid, decimal, decimal) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_collect_final_payment(uuid, decimal, decimal) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_collect_final_payment(uuid, decimal, decimal) TO service_role;
